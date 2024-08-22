from dataclasses import dataclass
from collections import defaultdict
import base64
import io
from typing import Any

from dash import Dash, dash_table, dcc, html, Input, Output, State, callback
import dash_bootstrap_components as dbc
import pandas as pd
import plotly.graph_objects as go

FAKE_ONE: float = 1 + 1337e-9
ZERO: float = 1337e-9
WHITE: str = "#FFFFFF"
UNDEFINED: str = "Undefined"


@dataclass
class Leaf:
    id: str = ""
    parent: str = ""
    color: str = ""
    count: int = 0
    label: str = ""
    description: str = ""
    level: int = 0
    children: int = 0


class Branch:
    def __init__(self):
        self.leaves: defaultdict[str, Leaf] = defaultdict(Leaf)

    def count_levels_and_children(self):
        for leaf_id, leaf in self.leaves.items():
            current_leaf = leaf
            level = 0
            while current_leaf.parent is not None:
                current_leaf = self.leaves[current_leaf.parent]
                current_leaf.children += 1
                level += 1
            leaf.level = level

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
            marker={
                "colors": [_.color for _ in self.leaves.values()],
                "line": {
                    "color": "black",
                    "width": 2
                }
            }
        )


class Tree:
    def __init__(self, id_separator: str = "|", level_separator: str = ".", parent_based: bool = True,
                 id_col: str = "ID", parent_col: str = "Parent", label_col: str = "Label",
                 description_col: str = "Description", count_col: str = "Count", color_col: str = "Color"):
        self.id_separator = id_separator
        self.level_separator = level_separator
        self.parent_based = parent_based
        self.id_col = id_col
        self.parent_col = parent_col
        self.label_col = label_col
        self.description_col = description_col
        self.count_col = count_col
        self.color_col = color_col

        self.branches: defaultdict[str, Branch] = defaultdict(Branch)

    def add_rows(self, rows: list[dict[str, Any]]):
        test_row = rows[0]
        if self.parent_based and self.parent_col not in test_row.keys():
            raise KeyError(f"Parent-based ontology expected, but '{self.parent_col}' not found in table.")
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
                if not _parent:
                    self.branches[leaf_id].leaves[leaf_id] = leaf
                else:
                    post_process.append(leaf)

        while len(post_process) != len(processed):
            while len(post_process) != len(processed):
                for leaf in post_process:
                    if leaf.id in processed:
                        continue
                    for branch in self.branches.values():
                        if leaf.parent in branch.leaves:
                            branch.leaves[leaf.id] = leaf
                            processed.append(leaf.id)
                            break

        for branch in self.branches.values():
            branch.count_levels_and_children()

    def get_traces(self) -> list[go.Sunburst]:
        return [_.get_sunburst_object() for _ in self.branches.values()]


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
                    style={"textDecoration": "none"},
                    target="_blank"
                ),
                dbc.Nav(
                    children=[
                        dbc.NavItem(dbc.NavLink("Load & Edit", active=True, id="collapse-load-button", n_clicks=0)),
                        dbc.NavItem(dbc.NavLink("Configure", active=True, id="collapse-config-button", n_clicks=0)),
                        dbc.NavItem(dbc.NavLink("Export", active=False, id="collapse-export-button", n_clicks=0)),
                        dbc.DropdownMenu(
                            children=[
                                dbc.DropdownMenuItem("More pages", header=True),
                                dbc.DropdownMenuItem("Delta 4 AI", className="text-capitalize",
                                                     href="https://www.delta4.ai", target="_blank"),
                                dbc.DropdownMenuItem("OntoloViz GitHub", className="text-capitalize",
                                                     href="https://www.github.com/Delta4AI/OntoloViz", target="_blank"),
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
            dcc.Upload(
                id="datatable-upload",
                children=html.Div(["Drag and Drop or ", html.A("Select File")]),
                style={
                    "width": "98.8%",
                    "height": "60px",
                    "lineHeight": "60px",
                    "borderWidth": "1px",
                    "borderStyle": "dashed",
                    "borderRadius": "5px",
                    "textAlign": "center",
                    "margin": "10px"
                },
            ),
            dash_table.DataTable(
                id="datatable-upload-container",
                page_current=0,
                page_size=10,
                editable=True,
                sort_action="native",
                style_table={
                    "padding": "6px",
                },
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
            )
        ]), id="collapse-load", is_open=True,
    )


def get_layout_config() -> dbc.Collapse:
    return dbc.Collapse(
        dbc.Card(
            dbc.CardBody([
                html.Div([
                    *_get_label_badge_combo(description="Ontology Type", tooltip="EDIT ME Ontology type description"),
                    dcc.RadioItems(["Parent-based", "Separator-based"], "Parent-based"),
                ], className="me-5"),
                html.Div([
                    *_get_label_badge_combo(description="Separator Character", tooltip="EDIT ME Separator Character description"),
                    dcc.Dropdown(
                        id="separator-character",
                        options=[
                            {'label': '.', 'value': '.'},
                            {'label': ',', 'value': ','},
                            {'label': '|', 'value': '|'}
                        ],
                        value=".",
                    ),
                ], id="separator-character-row", className="me-5"),
                html.Div([
                    *_get_label_badge_combo(description="ID Column", tooltip="EDIT ME ID Column description"),
                    dcc.Dropdown(id="id-column"),
                ], className="me-5"),
                html.Div([
                    *_get_label_badge_combo(description="Parent Column", tooltip="EDIT ME Parent Column description"),
                    dcc.Dropdown(id="parent-column"),
                ], id="parent-column-row", className="me-5"),
                html.Div([
                    *_get_label_badge_combo(description="Label Column", tooltip="EDIT ME Label Column description"),
                    dcc.Dropdown(id="label-column"),
                ], className="me-5")
            ], style={"display": "flex", "flexWrap": "wrap", "alignItems": "center"})
        ), id="collapse-config", className="ms-2 me-2 mt-2 mb-2", is_open=True,
    )


def _get_label_badge_combo(description: str, tooltip: str) -> tuple[dbc.Label, dbc.Badge, dbc.Popover]:
    _id = description.lower().replace(" ", "-")
    return (dbc.Label(description),
            dbc.Badge("i", color="info", className="ms-2", pill=True, id=f"{_id}-target"),
            dbc.Popover(dbc.PopoverBody(tooltip), target=f"{_id}-target", trigger="click"))


def get_layout_export() -> dbc.Collapse:
    return dbc.Collapse(
        dbc.Card(
            dbc.CardBody(
                children=[
                    "Export Section"
                ]
            )
        ), id="collapse-export", className="ms-2 me-2 mt-2 mb-2", is_open=False,
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


@callback(
    Output("collapse-load", "is_open"),
    Output("collapse-load-button", "active"),
    [Input("collapse-load-button", "n_clicks")],
    [State("collapse-load", "is_open")],
)
def toggle_collapse_load(n, is_open):
    return (not is_open, not is_open) if n else (is_open, is_open)


@callback(
    Output("collapse-config", "is_open"),
    Output("collapse-config-button", "active"),
    [Input("collapse-config-button", "n_clicks")],
    [State("collapse-config", "is_open")],
)
def toggle_collapse_load(n, is_open):
    return (not is_open, not is_open) if n else (is_open, is_open)


@callback(
    Output("collapse-export", "is_open"),
    Output("collapse-export-button", "active"),
    [Input("collapse-export-button", "n_clicks")],
    [State("collapse-export", "is_open")],
)
def toggle_collapse_load(n, is_open):
    return (not is_open, not is_open) if n else (is_open, is_open)


def parse_contents(contents, filename):
    content_type, content_string = contents.split(',')
    decoded = base64.b64decode(content_string)
    if "csv" in filename:
        return pd.read_csv(io.StringIO(decoded.decode("utf-8")))
    elif "xls" in filename:
        return pd.read_excel(io.BytesIO(decoded))
    elif "tsv" in filename:
        return pd.read_csv(io.StringIO(decoded.decode("utf-8")), delimiter="\t")


@callback(Output('datatable-upload-container', 'data'),
          Output('datatable-upload-container', 'columns'),
          Output('datatable-upload-container', 'tooltip_data'),
          Output("id-column", "options"),
          Input('datatable-upload', 'contents'),
          State('datatable-upload', 'filename'))
def update_output(contents, filename):
    if contents is None:
        df = pd.read_csv("../../templates/custom_template_parent_based_1D.tsv", delimiter="\t")
        # return [{}], [], [{}]
    else:
        df = parse_contents(contents, filename)

    _data = df.to_dict('records')
    _columns = [{"name": i, "id": i} for i in df.columns]
    _tooltip_data = [{column: {
        'value': str(value), 'type': 'markdown'
    } for column, value in row.items()} for row in _data]
    _id_column_options = [{"label": _, "value": _} for _ in [list(_.values())[0] for _ in _columns]]
    return _data, _columns, _tooltip_data, _id_column_options


@callback(
    Output("table-output", "figure"),
    Input("datatable-upload-container", "data"),
    Input("datatable-upload-container", "columns"))
def display_output(rows, columns):
    tree = Tree(id_separator="|", level_separator=".", parent_based=True, id_col="ID", parent_col="Parent",
                label_col="Label", description_col="Description", count_col="Count", color_col="Color")
    tree.add_rows(rows=rows)
    traces = tree.get_traces()

    buttons = []
    for i in range(len(traces)):
        buttons.append({"label": f"Header {i}",
                        "method": "update",
                        "args": [{"visible": [i == j for j in range(len(traces))]},
                                 {"title": f"Specific Header {i}"}]})

    menu = [{
        "active": -1,
        "buttons": buttons,
        "yanchor": "bottom",
        "pad": {"t": 2, "b": 10},
        "x": 0.5,
        "xanchor": "center"
    }]
    layout = {
        "title": {
            "text": "Overall title?",
            "x": 0.5,
            "xanchor": "center"
        },
        "showlegend": False,
        "updatemenus": menu
    }

    # create figure, hide initial data
    if len(traces) > 1:
        fig = go.Figure(data=traces, layout=layout)
        fig.update_traces(visible="legendonly")
    else:
        fig = go.Figure(data=traces[0])
    return fig


if __name__ == "__main__":
    app = Dash(__name__, external_stylesheets=["https://codepen.io/chriddyp/pen/bWLwgP.css", dbc.themes.SANDSTONE])
    app.layout = html.Div([
        get_layout_navbar(),
        get_layout_data_table(),
        get_layout_config(),
        get_layout_export(),
        get_layout_graph(),
    ])
    app.run(debug=True)
