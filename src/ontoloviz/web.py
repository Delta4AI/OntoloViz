try:
    from dash.exceptions import PreventUpdate
except ImportError:
    print("It looks like the optional web dependencies are not installed. Please run:")
    print("    pip install ontoloviz[web]")
    exit(1)

import uuid
from dataclasses import dataclass
import datetime
from collections import defaultdict
import base64
import io
from typing import Any, Tuple, List, Dict
import urllib
import random
import json

from dash import (Dash, dash_table, dcc, html, Input, Output, State, callback, callback_context, no_update,
                  clientside_callback, ALL, MATCH)
import dash_bootstrap_components as dbc
import pandas as pd
import plotly.graph_objects as go
from dash.html import Div
from dash_bootstrap_components import Popover

from ontoloviz.core import SunburstBase
from ontoloviz.core_utils import generate_color_range, generate_composite_color_range

""" ########################## Tree Components ############################### """
FAKE_ONE: float = 1 + 1337e-9
ZERO: float = 1337e-9
WHITE: str = "#FFFFFFFF"
TRANSPARENT: str = "#FFFFFF00"
UNDEFINED: str = "Undefined"
INDIVIDUAL_PLOTS: str = "Individual Plots & Menu"
SUMMARY_PLOT: str = "Summary Plot"
PARENT_BASED_ONTOLOGY: str = "Parent-based"
SEPARATOR_BASED_ONTOLOGY: str = "Separator-based"
GLOBAL: str = "global"
LOCAL: str = "local"

app = None

TEMPLATE_PARENT_BASED_TSV: str = """ID	Parent	Label	Description	Count	Color
A		group 1
X001	A	child 1	Child attached to group 1	1
X002	A	child 2	Child attached to group 1	2
X003	X002	child 3	Child attached to child 2	3	#0000FF
B		group 2			
X004|X005|X006	B	child X	Multiple children attached to group	2	#FF0000
X007|X008	X005	child Y	Multiple children attached to child 5		
"""

TEMPLATE_SEPARATOR_BASED_TSV: str = """ID	Label	Description	Count	Color
A	my group			
A.1	child 1	Child attached to group
A.1.2	child 2	Child attached to child 1
A.1.3	child 3	Child attached to child 1	1	#0000FF
B.1.2.3.4|C.1.2.3.4.5	child 4	Child without any parent	2	#FF0000
"""


@dataclass
class Leaf:
    id: str = ""
    parent: str = ""
    color: str = WHITE
    count: [float, int] = FAKE_ONE
    label: str = UNDEFINED
    description: str = UNDEFINED
    level: int = 0
    children: int = 0


class Branch:
    def __init__(self):
        self.leaves: defaultdict[str, Leaf] = defaultdict(Leaf)
        self.max_val: float = 0.0
        self.min_val: float = 0.0
        self.unique_vals: set = set()

    def count_levels_and_children(self):
        for leaf_id, leaf in self.leaves.items():
            current_leaf = leaf
            level = 0
            while current_leaf.parent is not None:
                current_leaf = self.leaves[current_leaf.parent]
                current_leaf.children += 1
                level += 1
            leaf.level = level
            if leaf.count not in [FAKE_ONE, ZERO]:
                count = float(leaf.count)
                if count >= self.max_val:
                    self.max_val = count
                if count <= self.min_val:
                    self.min_val = count
                self.unique_vals.add(count)

    def get_sunburst_object(self) -> go.Sunburst:
        return go.Sunburst(
            labels=[_.label for _ in self.leaves.values()],
            parents=[_.parent for _ in self.leaves.values()],
            values=[_.count if _.count else FAKE_ONE for _ in self.leaves.values()],
            ids=[_.id for _ in self.leaves.values()],
            hovertemplate=("<b>%{label}</b>"
                           "<br>--<br>"
                           "Description: %{customdata[0]}"
                           "<br>"
                           "ID: %{customdata[1]}"
                           "<br>"
                           "Children: %{customdata[2]}"
                           "<br>"
                           "Count: %{customdata[3]}"
                           "<extra></extra>"),
            customdata=[
                [
                    _.description,
                    _.id,
                    _.children,
                    _.count if _.count != FAKE_ONE else 0
                ] for _ in self.leaves.values()
            ],
            marker=dict(
                colors=[_.color for _ in self.leaves.values()],
                line=dict(
                    color="black",
                    width=2
                ),
            ),
            textfont=dict(
                size=24,
            )
        )


class Tree:
    def __init__(self, id_separator: str = "|", level_separator: str = ".", id_col: str = "ID",
                 parent_col: str = "Parent", label_col: str = "Label", description_col: str = "Description",
                 count_col: str = "Count", color_col: str = "Color"):
        self.id_separator = id_separator
        self.level_separator = level_separator
        self.id_col = id_col
        self.parent_col = parent_col
        self.label_col = label_col
        self.description_col = description_col
        self.count_col = count_col
        self.color_col = color_col

        self.branches: defaultdict[str, Branch] = defaultdict(Branch)
        self.branch_title_lookup = []
        self.id_to_leaf = dict()
        self.traces = None

    def apply_color(self, color_scale: dict[str, str], global_scale: bool):
        global_max_val = None
        global_min_val = None
        global_unique_vals = None
        global_color_range = None
        cs = {float(k): v for k, v in sorted(color_scale.items(), key=lambda x: int(x[0]))}
        if global_scale:
            global_max_val = max(_.max_val for _ in self.branches.values())
            global_min_val = min(_.min_val for _ in self.branches.values())
            global_unique_vals = set(v for branch in self.branches.values() for v in branch.unique_vals)
            global_color_range = {k: v for k, v in zip(global_unique_vals,
                                                       generate_composite_color_range(color_scale=cs, total_colors=len(
                                                           global_unique_vals)))}

        for branch in self.branches.values():
            _max = global_max_val if global_max_val else branch.max_val
            _min = global_min_val if global_min_val else branch.min_val
            _vals = global_unique_vals if global_unique_vals else branch.unique_vals
            _cr = global_color_range if global_color_range else {k: v for k, v in zip(
                _vals, generate_composite_color_range(color_scale=cs, total_colors=len(_vals)))}
            for leaf in branch.leaves.values():
                if leaf.count not in [FAKE_ONE, ZERO] and leaf.color == WHITE:
                    leaf.color = _cr[float(leaf.count)]
                    # print(f"Apply color to {leaf} based on min: {_min} and max: {_max}")

    def add_rows(self, rows: list[dict[str, Any]], ontology_type: str):
        if ontology_type == PARENT_BASED_ONTOLOGY:
            self._add_parent_based_rows(rows=rows)
        else:
            self._add_id_based_rows(rows=rows)
        for branch in self.branches.values():
            branch.count_levels_and_children()

    def _add_parent_based_rows(self, rows: list[dict[str, Any]]):
        test_row = rows[0]
        if self.parent_col not in test_row.keys():
            raise KeyError(f"{PARENT_BASED_ONTOLOGY} ontology expected, but '{self.parent_col}' not found in table.")
        if self.id_col not in test_row.keys():
            raise KeyError(f"ID column '{self.id_col}' not found in table.")

        post_process = []
        processed = []

        for row in rows:
            _id = row[self.id_col]
            _parent = row[self.parent_col]
            if not _id:
                continue
            for leaf_id in _id.split(self.id_separator):
                leaf = Leaf(
                    id=leaf_id,
                    parent=_parent,
                    color=row.get(self.color_col) or WHITE,
                    count=row.get(self.count_col) or FAKE_ONE,
                    label=row.get(self.label_col) or UNDEFINED,
                    description=row.get(self.description_col) or UNDEFINED,
                )
                self.id_to_leaf[leaf_id] = leaf
                if not _parent:
                    self.branches[leaf_id].leaves[leaf_id] = leaf
                    self.branch_title_lookup.append(leaf_id)
                else:
                    post_process.append(leaf)

        if len(self.branches) == 0:
            raise ValueError("Could not identify any branch! Make sure the Parent Column is set correctly, and that at "
                             "least one ID without a parent exists to create a new branch.")

        iterations = 0
        while len(post_process) != len(processed):
            for leaf in post_process:
                if leaf.id in processed:
                    continue
                for branch in self.branches.values():
                    if leaf.parent in branch.leaves:
                        branch.leaves[leaf.id] = leaf
                        processed.append(leaf.id)
                        break
            iterations += 1
            if iterations == 100:
                raise ValueError("Could not build tree. Make sure the Columns are set properly.")

    def _add_id_based_rows(self, rows):
        table_data = dict()

        for row in rows:
            _id = row[self.id_col]
            if not _id:
                continue

            for leaf_id in _id.split(self.id_separator):
                table_data[leaf_id] = row

                # pre-populate all available leaves
                for uncertain_leaf_id in reversed([leaf_id.rsplit(self.level_separator, i)[0] for i in
                                                   range(leaf_id.count(self.level_separator) + 1)]):
                    parent = uncertain_leaf_id.rsplit(self.level_separator, 1)[0]
                    parent = parent if parent != uncertain_leaf_id else None
                    leaf = Leaf(
                        id=uncertain_leaf_id,
                        parent=parent,
                    )
                    self.id_to_leaf[uncertain_leaf_id] = leaf

                    first_level_id = uncertain_leaf_id.split(self.level_separator)[0]
                    if first_level_id not in self.branches:
                        self.branch_title_lookup.append(first_level_id)
                    self.branches[first_level_id].leaves[uncertain_leaf_id] = leaf

        # transfer table data to available leaves
        for row in table_data.values():
            _id = row[self.id_col]
            if not _id:
                continue

            for leaf_id in _id.split(self.id_separator):
                first_level_id = leaf_id.split(self.level_separator)[0]
                self.branches[first_level_id].leaves[leaf_id].color = row.get(self.color_col) or WHITE
                self.branches[first_level_id].leaves[leaf_id].count = row.get(self.count_col) or FAKE_ONE
                self.branches[first_level_id].leaves[leaf_id].label = row.get(self.label_col) or UNDEFINED
                self.branches[first_level_id].leaves[leaf_id].description = row.get(self.description_col) or UNDEFINED

    def get_traces(self):
        self.traces = [_.get_sunburst_object() for _ in self.branches.values()]

    def get_individual_plots(self) -> go.Figure:
        buttons = []
        for i in range(len(self.traces)):
            buttons.append({"label": f"Tree {self.branch_title_lookup[i]}",
                            "method": "update",
                            "args": [{"visible": [i == j for j in range(len(self.traces))]}]})

        menu = [{
            "active": 0,
            "type": "buttons",
            "direction": "right",
            "buttons": buttons,
            "yanchor": "bottom",
            "pad": {"t": 0, "b": 10},
            "x": 0.5,
            "y": 1.2,
            "xanchor": "center"
        }]
        layout = {
            "showlegend": False,
            "updatemenus": menu,
        }

        # create figure, hide initial data
        if len(self.traces) > 1:
            fig = go.Figure(data=self.traces, layout=layout)
            fig.update_traces(visible="legendonly")
            fig.data[0].update(visible=True)
        else:
            fig = go.Figure(data=self.traces[0])

        return fig

    def get_summary_plot(self, cols: int):
        return SunburstBase.generate_subplot_figure(
            cols=cols,
            traces=self.traces,
            headers=[f"Tree {_}" for _ in self.branch_title_lookup],
            title=f"Summary of {len(self.traces)} trees"
        )


""" ########################## Utility ############################### """


class ColorPicker:
    def __init__(self, children: list[dict[str, Any]] = None, marks: dict[str, str] = None, values: list[int] = None):
        self.children = children if children else no_update
        self.marks = marks if marks else no_update
        self.values = values if values else no_update

    @property
    def sample_scale_style(self):
        gradient_str = ", ".join([f"{v} {k}%" for k, v in self.marks.items()])
        return {
            "background-image": f"linear-gradient(to right, transparent 0%, {gradient_str}, transparent 100%)",
            "width": "100%",
            "height": "12px",
            "margin-left": "0.25rem",
            "border-radius": "20px",
        }

    def remove_picker(self, n_clicks: int):
        max_value = max(map(int, self.marks.keys()))
        removed_color = self.marks.pop(str(max_value), None)
        child_idx = [c["props"]["children"][0]["props"]["value"] for c in self.children].index(removed_color)
        self.children.pop(child_idx)
        try:
            self.values.pop(self.values.index(max_value))
        except ValueError:
            self.values.pop(len(self.values) - 1)
        self._redistribute_values_and_marks(add=False)

    def slider_event(self):
        self._update_marks()

    def picker_event(self, picker_obj: dict[str, Any], colors: list[str]):
        colors_uniq = set([_.lstrip("#").lower() for _ in colors])
        mark_key_to_replace = [k for k, v in self.marks.items() if v.lstrip("#").lower() not in colors_uniq][0]
        try:
            new_color = list(colors_uniq - set([_.lstrip("#").lower() for _ in self.marks.values()]))[0]
            self.marks[mark_key_to_replace] = f"#{str(new_color).upper()}"
        except IndexError:
            # in case of duplicate color, ignore potential index errors
            self.marks = {str(v): c.upper() for v, c in zip(self.values, colors)}

    def add_picker(self, n_clicks: int):
        new_color = self.get_random_hex_color()
        if isinstance(self.children, dict):
            self.children = [self.children]

        self.children.append(self.get_row(idx=n_clicks, color=new_color))
        self._redistribute_values_and_marks(add=True, new_color=new_color)

    def _redistribute_values_and_marks(self, add: bool, new_color: str = None):
        target_length = len(self.values) + 1 if add else len(self.values)
        self.values = [int(i * 100 / (target_length - 1)) for i in range(target_length)]
        if add:
            self.marks = {k: v for k, v in zip(self.values[:-1], self.marks.values())} | {100: new_color}
        else:
            self.marks = {k: v for k, v in zip(self.values, self.marks.values())}

    def _update_marks(self):
        self.marks = {str(_): v for v, _ in zip(self.marks.values(), self.values)}

    def _add_to_marks(self, new_color: str):
        self.marks = {int(value): self.marks[old_value] if old_value in self.marks else new_color
                      for value, old_value in zip(self.values, self.marks.keys())}
        self.marks[100] = new_color
        self._update_marks()

    @staticmethod
    def get_random_hex_color() -> str:
        return "#" + "".join([random.choice("0123456789ABCDEF") for _ in range(6)])

    @staticmethod
    def get_row(idx: int, color: str) -> dbc.Row:
        return dbc.Row([
            dbc.Input(
                type="color",
                id={"type": "colorpicker_input", "index": idx},
                value=color,
                className="color-picker",
            ),
        ], id={"type": "colorpicker-holder", "index": idx}, className="color-picker-wrapper")


""" ########################## Dash Components ############################### """


def get_layout_navbar() -> dbc.Navbar:
    return dbc.Navbar(
        dbc.Container(
            [
                html.A(
                    dbc.Row(
                        [
                            dbc.Col(html.Img(src="assets/logo.svg", height="40px")),
                            dbc.Col(dbc.NavbarBrand(children=[
                                html.Span(children="OntoloViz", className="fw-bold"),
                                html.Span(children="Web", className="fw-bold ms-1 text-danger"),
                            ], className="ms-2")),
                        ],
                        align="center",
                        className="g-0",
                    ),
                    href="https://www.delta4.ai",
                    target="_blank",
                    id="navbar-brand-text",
                ),
                dbc.Nav(
                    children=[
                        dbc.NavItem(dbc.NavLink("Load & Edit Data", active=True, id="load-navlink", n_clicks=0)),
                        dbc.NavItem(dbc.NavLink("Configure Plot", active=False, id="configure-navlink", n_clicks=0)),
                        dbc.NavItem(dbc.NavLink("Export", active=False, id="export-navlink", n_clicks=0)),
                        dbc.DropdownMenu(
                            children=[
                                dbc.DropdownMenuItem("Quick Links", header=True),
                                dbc.DropdownMenuItem([
                                    html.I(className="bi bi-globe me-2"),
                                    "Delta 4 AI"
                                ], className="text-capitalize", href="https://www.delta4.ai", target="_blank"),
                                dbc.DropdownMenuItem([
                                    html.I(className="bi bi-github me-2"),
                                    "OntoloViz"
                                ], className="text-capitalize", href="https://www.github.com/Delta4AI/OntoloViz",
                                    target="_blank"),
                                dbc.DropdownMenuItem([
                                    html.I(className="bi bi-linkedin me-2"),
                                    "Matthias Ley"
                                ], className="text-capitalize", href="https://www.linkedin.com/in/matthias-ley",
                                    target="_blank"),
                            ],
                            nav=True,
                            in_navbar=True,
                            label="More",
                        ),
                    ],
                    className="ms-auto",
                    navbar=True,
                ),
            ],
        ),
        color="primary",
        dark=True,
        className="mb-5",
    )


def get_layout_data_table() -> dbc.Collapse:
    return dbc.Collapse(
        html.Div([
            dbc.Card([
                dbc.CardBody([
                    dbc.Row([
                        dbc.Col([
                            *_get_label_badge_combo(label="Ontology Type",
                                                    tooltip=(
                                                        "You can load two types of ontologies: parent-based and "
                                                        "separator-based. Parent-based ontologies include columns for "
                                                        "IDs and their respective parents. Separator-based ontologies "
                                                        "use an ID with tree-syntax, such as the MeSH ontology with "
                                                        "IDs like 'C01.001'. When loading custom files, please ensure "
                                                        "you set the appropriate ontology type beforehand."
                                                    ),
                                                    bold=False, italic=False)],
                            className="collapse-card-header"),
                        dbc.Col([html.Div([
                            dcc.RadioItems(
                                options=[PARENT_BASED_ONTOLOGY, SEPARATOR_BASED_ONTOLOGY],
                                value=PARENT_BASED_ONTOLOGY,
                                inline=True,
                                labelStyle={"padding-right": "20px"},
                                inputStyle={"margin-right": "4px"},
                                id="ontology-type"
                            ),
                        ]), ])
                    ]),
                    dcc.Upload(
                        id="datatable-upload",
                        children=html.Div(["Drag and Drop or ", html.A("Click to Upload")]),
                    ),

                    dash_table.DataTable(
                        id="datatable",
                        page_current=0,
                        page_size=10,
                        export_format="csv",
                        editable=True,
                        row_deletable=True,
                        sort_action="native",
                        style_cell={
                            "overflow": "hidden",
                            "textOverflow": "ellipsis",
                            "maxWidth": 0,
                            "padding": "2px",
                        },
                        style_data={},
                        tooltip_duration=None,
                        tooltip_delay=1000,
                        css=[{
                            "selector": ".dash-table-tooltip",
                            "rule": "background-color: #C33D35; color: white;"
                        }],
                    ),
                    dbc.Button("Add Row", id='datatable-add-row-button', n_clicks=0, className="mt-2 mb-2"),
                ])], className="ms-2 me-2 mt-2 mb-2"),
        ]), id="load-collapse", is_open=False,
    )


def get_layout_config() -> dbc.Card:
    return dbc.Card([
        dbc.CardBody([
            html.Div([
                dbc.Row([
                    dbc.Col(html.Span("Data Mapping"), className="collapse-card-header configure-header"),
                    dbc.Col(get_layout_config_data_elements(), className="collapse-card configure-cell"),
                ], className="configure-row", id="data-columns-config"),
                dbc.Row([
                    dbc.Col(children=[
                        dbc.Row([*_get_label_badge_combo(
                            label="Colors",
                            tooltip="Applies the defined color scale to rows with a count value. "
                                    "Rows with a manually defined color are not overwritten. "
                                    "Values outside of the defined thresholds will remain "
                                    "transparent. 0% represents the row with the lowest count, "
                                    "100% the row with the highest count.",
                            bold=False, italic=False)]),
                        get_colorpicker_plus_minus_buttons()
                    ], className="collapse-card-header configure-header"),
                    dbc.Col(get_layout_config_color_elements(), className="collapse-card configure-cell me-3"),
                ], className="border-top configure-row"),
                dbc.Row([
                    dbc.Col(html.Span("Labels"), className="collapse-card-header configure-header"),
                    dbc.Col(get_layout_config_label_elements(), className="collapse-card configure-cell"),
                ], className="border-top configure-row disabled"),
                dbc.Row([
                    dbc.Col([
                        *_get_label_badge_combo(label="Propagation",
                                                tooltip="By enabling propagation, counts and colors can be "
                                                        "up-propagated up to the central node of the tree",
                                                bold=False, italic=False)],
                        className="collapse-card-header configure-header"),
                    dbc.Col(get_layout_config_propagate_elements(), className="collapse-card configure-cell"),
                ], className="border-top configure-row disabled"),
                dbc.Row([
                    dbc.Col(html.Span("Border"), className="collapse-card-header configure-header"),
                    dbc.Col(get_layout_config_border_elements(), className="collapse-card configure-cell"),
                ], className="border-top configure-row disabled"),
                dbc.Row([
                    dbc.Col(html.Span("Legend"), className="collapse-card-header configure-header"),
                    dbc.Col(get_layout_config_legend_elements(), className="collapse-card configure-cell"),
                ], className="border-top configure-row disabled"),
                dbc.Row([
                    dbc.Col(html.Span("Plot Style"), className="collapse-card-header configure-header"),
                    dbc.Col(get_layout_plot_type_elements(), className="collapse-card configure-cell"),
                ], className="border-top configure-row"),
            ], id="config-inactive-controller"),
        ]),
    ])


def get_layout_config_data_elements() -> list[html.Div]:
    return [
        html.Div([
            *_get_label_badge_combo(label="Level Separator",
                                    tooltip="Select the character that is used to distinguish hierarchical levels in "
                                            "the ID values of your data"),
            dcc.Dropdown(
                id="separator-character",
                options=[
                    {'label': '.', 'value': '.'},
                    {'label': ',', 'value': ','},
                    {'label': ';', 'value': ';'},
                    {'label': '_', 'value': '_'},
                    {'label': 'space', 'value': ' '},
                ],
                value=".",
            ),
        ], id="separator-character-row", className="me-5"),
        html.Div([
            *_get_label_badge_combo(label="ID Column", tooltip="Select the column in your data that contains IDs"),
            dcc.Dropdown(id="id-column"),
        ], className="me-5"),
        html.Div([
            *_get_label_badge_combo(label="Parent Column", tooltip="Select the column in your data that contains "
                                                                   "parent IDs"),
            dcc.Dropdown(id="parent-column"),
        ], id="parent-column-row", className="me-5"),
        html.Div([
            *_get_label_badge_combo(label="Label Column", tooltip="Select the column in your data that contains "
                                                                  "labels"),
            dcc.Dropdown(id="label-column"),
        ], className="me-5"),
        html.Div([
            *_get_label_badge_combo(label="Description Column", tooltip="Select the column in your data that contains "
                                                                        "descriptions (shown as interactive tooltips"),
            dcc.Dropdown(id="description-column"),
        ], className="me-5"),
        html.Div([
            *_get_label_badge_combo(label="Count Column", tooltip="Select the column in your data that contains "
                                                                  "counts (int or float values greater than 0)"),
            dcc.Dropdown(id="count-column"),
        ], className="me-5"),
        html.Div([
            *_get_label_badge_combo(label="Color Column", tooltip="Select the column in your data that contains "
                                                                  "colors (hex codes with preceding #, e.g. #FF0000)"),
            dcc.Dropdown(id="color-column"),
        ], className="me-5"),
        html.Span(id="data-columns-config-status", className="mt-2 text-danger")
    ]


def get_colorpicker_slider() -> dbc.Row:
    return dbc.Row([
        dbc.Col([
            dbc.Row([
                dcc.RangeSlider(
                    id="colorpicker-slider",
                    min=0,
                    max=100,
                    value=[0, 100],
                    pushable=2,
                    className="color-picker-scale",
                    marks={0: "#000000", 100: "#C33D35"},
                    tooltip={"always_visible": True, "template": "{value}%"}
                    # tooltip={"always_visible": True, "transform": "hexColorToToolTip"}
                )]),
            dbc.Row([
                html.Div(id="colorpicker-sample")]),
            html.Div([
                ColorPicker.get_row(idx=0, color="#000000"),
                ColorPicker.get_row(idx=1, color="#C33D35"),
            ], id="colorpicker-container"),
        ])
    ])


def get_colorpicker_plus_minus_buttons() -> dbc.Row:
    return dbc.Row([
        dbc.ButtonGroup([
            dbc.Button(" - ", id="colorpicker-rm", n_clicks=0, disabled=True,
                       className="plus-minus-btn btn-danger"),
            dbc.Button(" + ", id="colorpicker-add", n_clicks=1, disabled=False,
                       className="plus-minus-btn"),
        ])
    ])


def get_colorpicker_global_local_apply_elements() -> dbc.Row:
    combo_div, combo_popover = _get_label_badge_combo(
        label=None,
        tooltip=(
            "apply the color scale based on the maximum values of the entire tree (global) "
            "or each sub-tree individually (local)"
        )
    )

    return dbc.Row([
        dbc.Col([
            html.Div([
                dcc.RadioItems(
                    [LOCAL, GLOBAL],
                    LOCAL,
                    inline=True,
                    inputStyle={"margin-right": "4px", "margin-left": "4px"},
                    id="colorpicker-global-local"
                ),
                html.Div([
                    combo_div,
                    combo_popover
                ], className="d-inline-flex align-items-center"),
            ], className="d-flex align-items-center justify-content-end"),
        ], className="d-flex align-items-center justify-content-end"),
        dbc.Col([
            html.Div([
                dbc.Button("Clear", id="colorpicker-reset", n_clicks=0, className="ms-2 me-2 btn-danger"),
                dbc.Button("Apply", id="colorpicker-apply", n_clicks=0)
            ])
        ], className="d-flex align-items-center justify-content-start")
    ], className="mt-2")


def get_layout_config_color_elements() -> dbc.Container:
    return dbc.Container([
        get_colorpicker_slider(),
        get_colorpicker_global_local_apply_elements()
    ], className="full-width")

@callback(
    [
        Output("colorpicker-container", "children"),
        Output("colorpicker-slider", "marks"),
        Output("colorpicker-slider", "value"),
        Output("colorpicker-sample", "style"),
        Output("colorpicker-add", "disabled"),
        Output("colorpicker-rm", "disabled"),
    ],
    [
        Input("colorpicker-add", "n_clicks"),
        Input("colorpicker-rm", "n_clicks"),
        Input("colorpicker-slider", "value"),
        Input({"type": "colorpicker_input", "index": ALL}, "value"),
    ],
    [
        State("colorpicker-container", "children"),
        State("colorpicker-slider", "marks"),
    ]
)
def update_color_picker(n_clicks_add, n_clicks_rm, slider_values, colorpicker_values, container_children, slider_marks):
    if not callback_context.triggered:
        if n_clicks_add == 1:
            cp = ColorPicker(children=container_children, marks=slider_marks, values=slider_values)
            return cp.children, cp.marks, cp.values, cp.sample_scale_style, no_update, no_update
        raise PreventUpdate

    button_id = callback_context.triggered[0]['prop_id'].split('.')[0]
    cp = ColorPicker(children=container_children, marks=slider_marks, values=slider_values)

    if button_id == "colorpicker-add":
        cp.add_picker(n_clicks=n_clicks_add)

    elif button_id == "colorpicker-slider":
        cp.slider_event()

    elif button_id == "colorpicker-rm":
        cp.remove_picker(n_clicks=n_clicks_rm)

    elif "colorpicker_input" in button_id:
        cp.picker_event(picker_obj=json.loads(button_id), colors=colorpicker_values)

    add_btn_disabled = True if len(cp.values) >= 20 else False
    rm_btn_disabled = True if len(cp.values) <= 2 else False

    return cp.children, cp.marks, cp.values, cp.sample_scale_style, add_btn_disabled, rm_btn_disabled


def get_layout_config_label_elements() -> list[html.Div]:
    return [
        *_get_label_badge_combo(label="Show Labels", tooltip="EDIT ME Show Labels description",
                                bold=True, italic=False),
        dcc.Dropdown(
            id="show-labels",
            options=[
                {"label": "all", "value": "all"},
                {"label": "none", "value": "none"},
                {"label": "first", "value": "first"},
                {"label": "last", "value": "last"},
                {"label": "first + last", "value": "first + last"},
            ],
            value="all",
            className="ms-2 fixed-width"
        ),
    ]


def get_layout_config_propagate_elements() -> list[html.Div]:
    return [
        html.Div([
            dbc.Checkbox(label="Enable", value=False, id="propagate-enable", className="me-5"),
        ]),
        html.Div([
            html.Div([
                *_get_label_badge_combo(label="Scale",
                                        tooltip="This option controls whether the propagation should "
                                                "be limited to each tree (Individual), or to consider "
                                                "the entire ontology (Global)"),
                dcc.RadioItems(["Individual", "Global"], "Individual",
                               inline=True, labelStyle={"padding-right": "20px"}, inputStyle={"margin-right": "4px"},
                               id="propagate-individual-global")
            ], className="d-flex flex-row align-items-center ms-2 me-5"),
            html.Div([
                *_get_label_badge_combo(label="Level", tooltip="Determine to which level in the tree the counts "
                                                               "should be up-propagated"),
                dbc.Input(type="number", min=1, max=15, step=1, value=1, id="propagate-level")
            ], className="d-flex flex-row align-items-center ms-5")
        ], id="propagate-wrapper", style={"display": "none"})
    ]


def get_layout_config_border_elements() -> list[dbc.Row]:
    return [
        dbc.Row([
            dbc.Col(
                dbc.Label(
                    "Color: ",
                    className="me-2"
                )
            ),
            dbc.Col(
                dbc.Input(
                    type="color",
                    id="border-color",
                    value="#000000",
                    className="color-picker ms-2"
                )
            ),
            dbc.Col(
                dcc.Slider(min=0, max=100, step=1, value=100, marks=None,
                           tooltip={"placement": "right", "always_visible": True, "template": "Opacity: {value}%"},
                           id="border-opacity", className="fixed-width-2x")
            )
        ]),
        dbc.Row([
            dcc.Slider(min=0, max=10, step=0.1, value=2, marks=None,
                       tooltip={"placement": "right", "always_visible": True, "template": "Width: {value}px"},
                       id="border-width", className="fixed-width-2x ms-5")
        ])
    ]


def get_layout_config_legend_elements() -> list[html.Div]:
    return [
        html.Div([
            dbc.Checkbox(label="Enable", value=True, id="legend-enable", className="me-5"),
        ]),
        html.Div([
            html.Div([
                dcc.RadioItems(["Continuous", "Discrete"], "Continuous", inline=True,
                               labelStyle={"padding-right": "20px"}, inputStyle={"margin-right": "4px"},
                               id="legend-type")
            ])
        ], id="legend-wrapper", style={"display": "none"})
    ]


def get_layout_plot_type_elements() -> list[html.Div]:
    return [
        html.Div([
            dcc.RadioItems([INDIVIDUAL_PLOTS, SUMMARY_PLOT], INDIVIDUAL_PLOTS,
                           inline=True, labelStyle={"padding-right": "20px"}, inputStyle={"margin-right": "4px"},
                           id="plot-type"),
        ], className="me-2"),
        html.Div([
            dbc.Input(type="number", min=1, max=15, step=1, value=3, id="plot-type-cols", placeholder="Columns",
                      disabled=True)
        ], className="me-2"),
        html.Div([
            dcc.Slider(min=10, max=3000, step=10, value=800, marks=None,
                       tooltip={"placement": "right", "always_visible": True, "template": "Plot Height: {value}px"},
                       className="me-5 mt-4", id="plot-height")
        ], style={"width": "50%"}),
    ]


def _get_label_badge_combo(label: str | None, tooltip: str, bold: bool = True, italic: bool = True) -> tuple[
    Div, Popover]:
    _id = label.lower().replace(" ", "-") if label else str(uuid.uuid4())
    return (
        html.Div(
            [
                dbc.Label(label, className=f"{['', 'fw-bold'][bold]} {['', 'fst-italic'][italic]}") if label else None,
                dbc.Button(
                    dbc.Badge("i", color="info", pill=True),
                    id=f"{_id}-target", className="btn-link popover-info-badge"
                ),
            ],
            className="popover-info-container"
        ),
        dbc.Popover([
            dbc.PopoverHeader(label, style={"font-weight": "bold", "font-size": "16px"}),
            dbc.PopoverBody(tooltip, style={"font-size": "14px"})
        ], target=f"{_id}-target", trigger="hover", style={"max-width": "50%", "width": "auto"})
    )


def get_layout_export() -> dbc.Card:
    return dbc.Card(
        dbc.CardBody(
            dbc.Row([
                dbc.Col(html.Span("Export as"), className="collapse-card-header"),
                dbc.Col([
                    html.Button("Table", className="me-2", id="export-table-button", n_clicks=0,
                                **{"data-dummy": ""}),
                    html.Button("HTML", className="me-2", id="export-html-button", n_clicks=0),
                    html.A("Download Now", className="text-primary", id="download-link",
                           download="export.html", style={"display": "none"}),
                ], className="collapse-card")
            ]),
        )
    )


def get_layout_graph() -> dcc.Graph:
    return dcc.Graph(id="table-output", config={
        "displaylogo": False,
        "responsive": True,
        "scrollZoom": True,
        "displayModeBar": True,
        "showLink": False,
        "toImageButtonOptions": {
            "format": "png",  # one of png, svg, jpeg, webp
            # download at the currently-rendered size by setting height and width to None
            "height": None,
            "width": None,
            "scale": 3  # Multiply title/legend/axis/canvas sizes by this factor
        }
    })


def parse_contents(contents, filename):
    content_type, content_string = contents.split(',')
    decoded = base64.b64decode(content_string)
    if "csv" in filename:
        return pd.read_csv(io.StringIO(decoded.decode("utf-8")))
    elif "xls" in filename:
        return pd.read_excel(io.BytesIO(decoded))
    elif "tsv" in filename:
        return pd.read_csv(io.StringIO(decoded.decode("utf-8")), delimiter="\t")


def get_table_objects(df: pd.DataFrame) -> tuple:
    _data = df.to_dict('records')
    _columns = [{"name": i, "id": i, "deletable": True} for i in df.columns]
    _tooltip_data = [{column: {
        'value': str(value), 'type': 'markdown'
    } for column, value in row.items()} for row in _data]
    _column_options = [{"label": _, "value": _} for _ in [list(_.values())[0] for _ in _columns]]

    return _data, _columns, _tooltip_data, _column_options


"""
############################## Collapse open/close events and active toggles ###########################
"""


@callback(
    Output("load-collapse", "is_open"),
    Output("load-navlink", "active"),
    [Input("load-navlink", "n_clicks")],
    [State("load-collapse", "is_open")],
)
def toggle_collapse_load(n, is_open):
    return (not is_open, not is_open) if n else (is_open, is_open)


@callback(
    Output("configure-offcanvas", "is_open"),
    Output("configure-navlink", "active"),
    Input("configure-navlink", "n_clicks"),
    Input("configure-offcanvas", "is_open"),
    State("configure-offcanvas", "is_open")
)

def toggle_collapse_configure(n_clicks, new_state, old_state):
    if not callback_context.triggered:
        raise PreventUpdate

    trigger_id = callback_context.triggered[0]["prop_id"].split(".")[0]

    # Case 1: user clicked the nav link
    if trigger_id == "configure-navlink":
        new_open = not old_state
        return new_open, new_open

    # Case 2: user closed (or opened) offcanvas manually
    return new_state, new_state


@callback(
    Output("export-offcanvas", "is_open"),
    Output("export-navlink", "active"),
    Input("export-navlink", "n_clicks"),
    Input("export-offcanvas", "is_open"),
    State("export-offcanvas", "is_open")
)

def toggle_collapse_configure(n_clicks, new_state, old_state):
    if not callback_context.triggered:
        raise PreventUpdate

    trigger_id = callback_context.triggered[0]["prop_id"].split(".")[0]

    if trigger_id == "export-navlink":
        new_open = not old_state
        return new_open, new_open

    return new_state, new_state


@callback(
    Output("plot-type-cols", "disabled"),
    Input("plot-type", "value"),
)
def toggle_plot_type_columns(value):
    return True if value == INDIVIDUAL_PLOTS else False


@callback(
    Output("propagate-wrapper", "style"),
    Input("propagate-enable", "value"))
def toggle_propagate_elements(value):
    if value:
        return {"display": "flex", "flex-direction": "row"}
    else:
        return {"display": "none"}


@callback(
    Output("legend-wrapper", "style"),
    Input("legend-enable", "value"))
def toggle_legend_elements(value):
    if value:
        return {"display": "flex", "flex-direction": "row"}
    else:
        return {"display": "none"}


"""
############################## Table brain callback ###########################
"""


@callback([
    Output('datatable', 'data'),
    Output('datatable', 'columns'),
    Output('datatable', 'tooltip_data'),
    Output("id-column", "options"),
    Output("id-column", "value"),
    Output("parent-column", "options"),
    Output("parent-column", "value"),
    Output("label-column", "options"),
    Output("label-column", "value"),
    Output("description-column", "options"),
    Output("description-column", "value"),
    Output("count-column", "options"),
    Output("count-column", "value"),
    Output("color-column", "options"),
    Output("color-column", "value"),
    Output('parent-column-row', 'style'),
    Output('separator-character-row', 'style')
], [
    Input('datatable-upload', 'contents'),
    Input('datatable-add-row-button', 'n_clicks'),
    Input("ontology-type", "value"),
    Input("colorpicker-apply", "n_clicks"),
    Input("colorpicker-reset", "n_clicks"),
], [
    State('datatable-upload', 'filename'),
    State('datatable', 'data'),
    State('datatable', 'columns'),
    State("colorpicker-slider", "marks"),
    State("colorpicker-global-local", "value"),
    State("plot-type", "value"),
    State("separator-character", "value"),
    State("id-column", "value"),
    State("parent-column", "value"),
    State("label-column", "value"),
    State("description-column", "value"),
    State("count-column", "value"),
    State("color-column", "value"),
])
def update_output(contents, add_row_n_clicks, ontology_type, colorpicker_apply_n_clicks, colorpicker_reset_n_clicks,
                  filename, datatable_rows, datatable_columns, colorpicker_slider_marks, colorpicker_global_local,
                  plot_type, level_separator, id_col, parent_col, label_col, description_col, count_col, color_col):
    triggered = [t['prop_id'] for t in callback_context.triggered]

    # vars below must match number of output parameters defined in callback above and must be returned
    datatable_data = no_update
    datatable_columns = datatable_columns if "datatable-add-row-button.n_clicks" in triggered else no_update
    datatable_tooltip_data = no_update
    column_options = no_update
    parent_column_row = {"display": "block" if ontology_type == PARENT_BASED_ONTOLOGY else "none"}
    separator_character_row = {"display": "none" if ontology_type == PARENT_BASED_ONTOLOGY else "block"}

    # initial load of a template
    if triggered == ["."] or triggered == ["ontology-type.value"]:
        df = pd.read_csv(io.StringIO(
            TEMPLATE_SEPARATOR_BASED_TSV if ontology_type == SEPARATOR_BASED_ONTOLOGY else TEMPLATE_PARENT_BASED_TSV
        ), delimiter="\t")
        datatable_data, datatable_columns, datatable_tooltip_data, column_options = get_table_objects(df=df)

    # trigger for "Add Row" button
    elif 'datatable-add-row-button.n_clicks' in triggered and add_row_n_clicks > 0:
        datatable_data = datatable_rows + [{c['id']: '' for c in datatable_columns}]

    # trigger for file upload
    elif 'datatable-upload.contents' in triggered:
        df = parse_contents(contents, filename)
        datatable_data, datatable_columns, datatable_tooltip_data, column_options = get_table_objects(df=df)

    elif "colorpicker-reset.n_clicks" in triggered and colorpicker_reset_n_clicks > 0:
        if color_col not in datatable_rows[0].keys():
            return
        for row in datatable_rows:
            row[color_col] = None
        datatable_data = datatable_rows

    elif "colorpicker-apply.n_clicks" in triggered and colorpicker_apply_n_clicks > 0:
        tree = Tree(
            id_separator="|",
            level_separator=level_separator,
            id_col=id_col,
            parent_col=parent_col,
            label_col=label_col,
            description_col=description_col,
            count_col=count_col,
            color_col=color_col
        )
        tree.add_rows(rows=datatable_rows, ontology_type=ontology_type)

        # add 0 and 100 as transparent marks if not existent
        color_scale = colorpicker_slider_marks | {k: TRANSPARENT for k in ["0", "100"]
                                                  if k not in colorpicker_slider_marks.keys()}
        tree.apply_color(color_scale=color_scale, global_scale=True if colorpicker_global_local == GLOBAL else False)
        datatable_data = []
        for row in datatable_rows:
            if not row[color_col] and row[count_col]:
                first_id = row[id_col].split("|")[0]
                row[color_col] = tree.id_to_leaf[first_id].color
            datatable_data.append(row)

    return [
        datatable_data,
        datatable_columns,
        datatable_tooltip_data,
        column_options,
        "ID" if column_options != no_update and "ID" in [_["value"] for _ in column_options] else no_update,
        column_options,
        "Parent" if column_options != no_update and "Parent" in [_["value"] for _ in column_options] else no_update,
        column_options,
        "Label" if column_options != no_update and "Label" in [_["value"] for _ in column_options] else no_update,
        column_options,
        "Description" if column_options != no_update and "Description" in [_["value"] for _ in
                                                                           column_options] else no_update,
        column_options,
        "Count" if column_options != no_update and "Count" in [_["value"] for _ in column_options] else no_update,
        column_options,
        "Color" if column_options != no_update and "Color" in [_["value"] for _ in column_options] else no_update,
        parent_column_row,
        separator_character_row
    ]

"""
############################## Events to hide/show configuration parameters based on ontology type ###################
"""

"""
############################## Visualize plot ###################
"""


@callback(
    [
        Output("table-output", "figure"),
        Output("data-columns-config", "className"),
        Output("data-columns-config-status", "children"),
        Output("config-inactive-controller", "style"),
    ], [
        Input("datatable", "data"),
        Input("datatable", "columns"),
        Input("ontology-type", "value"),
        Input("separator-character", "value"),
        Input("id-column", "value"),
        Input("parent-column", "value"),
        Input("label-column", "value"),
        Input("description-column", "value"),
        Input("count-column", "value"),
        Input("color-column", "value"),
        Input("plot-type", "value"),
        Input("plot-type-cols", "value"),
        Input("plot-height", "value"),
    ])
def visualize(datatable_data, datatable_columns, ontology_type, level_separator, id_col, parent_col, label_col,
              description_col, count_col, color_col, plot_type, plot_type_cols, plot_height):
    tree = Tree(
        id_separator="|",
        level_separator=level_separator,
        id_col=id_col,
        parent_col=parent_col,
        label_col=label_col,
        description_col=description_col,
        count_col=count_col,
        color_col=color_col
    )
    try:
        tree.add_rows(rows=datatable_data, ontology_type=ontology_type)
        tree.get_traces()
        if plot_type == INDIVIDUAL_PLOTS:
            figure = tree.get_individual_plots()
        else:
            figure = tree.get_summary_plot(cols=plot_type_cols)
        figure.update_traces(leaf=dict(opacity=1))
        figure.update_layout(height=plot_height)
        toggle_config_inactivity(inactive=False)
        return figure, "configure-row", "", {"opacity": "unset", "pointer-events": "unset"}

    except Exception as e:
        toggle_config_inactivity(inactive=True)
        return no_update, "configure-row error", str(e), {"opacity": "50%", "pointer-events": "none"}


def toggle_config_inactivity(inactive: bool):
    for element in app.layout.children:
        if isinstance(element, dbc.Row) and "config-inactive-controller" in element.className:
            if inactive:
                element.className = element.className.replace("config-inactive-controller-active",
                                                              "config-inactive-controller-inactive")
            else:
                element.className = element.className.replace("config-inactive-controller-inactive",
                                                              "config-inactive-controller-active")


"""
############################## Export ###################
"""


@callback(
    Output("download-link", "href"),
    Output("download-link", "download"),
    Output("download-link", "children"),
    Output("download-link", "style"),
    Input("export-html-button", "n_clicks"),
    State("datatable", "data"),
    State("datatable", "columns"),
    State("ontology-type", "value"),
    State("separator-character", "value"),
    State("id-column", "value"),
    State("parent-column", "value"),
    State("label-column", "value"),
    State("description-column", "value"),
    State("count-column", "value"),
    State("color-column", "value"),
    State("plot-type", "value"),
    State("plot-type-cols", "value")
)
def export_html(export_html_n_clicks, datatable_data, datatable_columns, ontology_type, level_separator, id_col,
                parent_col, label_col, description_col, count_col, color_col, plot_type, plot_type_cols):
    if export_html_n_clicks > 0:
        fig = visualize(datatable_data, datatable_columns, ontology_type, level_separator, id_col, parent_col,
                        label_col, description_col, count_col, color_col, plot_type, plot_type_cols)
        buffer = io.StringIO()
        fig.write_html(buffer)
        html_string = buffer.getvalue()
        data_url = "data:text/html;charset=utf-8," + urllib.parse.quote(html_string)
        fn = get_timestamp() + "_plot.html"
        return data_url, fn, f"Click to download: {fn}", {"display": "block"}
    return no_update, no_update, no_update, no_update


def get_timestamp():
    return datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")


clientside_callback(
    """
    function(n_clicks) {
        if (n_clicks > 0)
            document.querySelector("#datatable button.export").click()
        return ""
    }
    """,
    Output("export-table-button", "data-dummy"),
    [Input("export-table-button", "n_clicks")]
)


def run_webapp():
    global app

    app = Dash(
        __name__,
        external_scripts=["/assets/scripts.js"],
        external_stylesheets=["/assets/style.css", dbc.themes.SPACELAB, dbc.icons.BOOTSTRAP]
    )
    app.layout = dcc.Loading(
        id="loading-spinner",
        type="default",
        overlay_style={
            "visibility": "visible",
        },
        delay_show=250,
        fullscreen=True,
        children=html.Div([
            get_layout_navbar(),
            dbc.Offcanvas(
                get_layout_config(),
                id="configure-offcanvas",
                scrollable=True,
                is_open=False,
                backdrop=True,
                style={
                    "width": "50%"
                }
            ),
            dbc.Offcanvas(
                get_layout_export(),
                id="export-offcanvas",
                is_open=False,
                placement="bottom"
            ),
            html.Div(children=[get_layout_data_table(), get_layout_graph()]),
        ])
    )
    app.run(debug=True, dev_tools_hot_reload=True)


if __name__ == "__main__":
    run_webapp()