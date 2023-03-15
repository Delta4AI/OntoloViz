import os
import tarfile
import json
from traceback import format_exc
from re import match
from functools import partial
from tkinter import Tk, Toplevel, StringVar, BooleanVar, IntVar, filedialog, messagebox, ttk, END
from tkinter import Label as LabelOG
from tkinter import Entry as EntryOG
from tkinter.ttk import LabelFrame, Frame, Style
try:
    from ontoloviz.core import PhenotypeSunburst, DrugSunburst, rgb_to_hex, hex_to_rgb
except ModuleNotFoundError:
    from .core import PhenotypeSunburst, DrugSunburst, rgb_to_hex, hex_to_rgb
from threading import Thread
import time
import textwrap


class ToggleMixin:
    """Class to add flags to widgets for toggling their state selectively"""
    def __init__(self, db_w=False, mesh_w=False, atc_w=False, **kwargs):
        super().__init__(**kwargs)
        self.db_w = db_w
        self.mesh_w = mesh_w
        self.atc_w = atc_w


class Button(ToggleMixin, ttk.Button):
    def __init__(self, master: object = None, db_w: bool = False, mesh_w: bool = False,
                 atc_w: bool = False, **kwargs):
        super().__init__(master=master, db_w=db_w, mesh_w=mesh_w, atc_w=atc_w, **kwargs)


class Entry(ToggleMixin, ttk.Entry):
    def __init__(self, master: object = None, db_w: bool = False, mesh_w: bool = False,
                 atc_w: bool = False, **kwargs):
        super().__init__(master=master, db_w=db_w, mesh_w=mesh_w, atc_w=atc_w, **kwargs)


class Combobox(ToggleMixin, ttk.Combobox):
    def __init__(self, master: object = None, db_w: bool = False, mesh_w: bool = False,
                 atc_w: bool = False, **kwargs):
        super().__init__(master=master, db_w=db_w, mesh_w=mesh_w, atc_w=atc_w, **kwargs)


class Checkbutton(ToggleMixin, ttk.Checkbutton):
    def __init__(self, master: object = None, db_w: bool = False, mesh_w: bool = False,
                 atc_w: bool = False, **kwargs):
        super().__init__(master=master, db_w=db_w, mesh_w=mesh_w, atc_w=atc_w, **kwargs)


class Label(ToggleMixin, ttk.Label):
    def __init__(self, master: object = None, db_w: bool = False, mesh_w: bool = False,
                 atc_w: bool = False, **kwargs):
        super().__init__(master=master, db_w=db_w, mesh_w=mesh_w, atc_w=atc_w, **kwargs)


class Radiobutton(ToggleMixin, ttk.Radiobutton):
    def __init__(self, master: object = None, db_w: bool = False, mesh_w: bool = False,
                 atc_w: bool = False, **kwargs):
        super().__init__(master=master, db_w=db_w, mesh_w=mesh_w, atc_w=atc_w, **kwargs)


class ToolTip:
    """Class that adds tooltip functionality, call with create_tooltip(widget, text)"""
    def __init__(self, widget: [Label, Checkbutton, Combobox, Entry, Button, Radiobutton] = None):
        self.widget = widget
        self.tip_window = None
        self.id = None
        self.x = self.y = 0

    def showtip(self, text: str = None, alt_text: str = None):
        if self.tip_window or not text:
            return

        # calculate coordinates
        x, y, _cx, cy = self.widget.bbox("insert")
        x = x + self.widget.winfo_rootx() + 57
        y = y + cy + self.widget.winfo_rooty() + 27

        # create Toplevel
        self.tip_window = tw = Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry("+%d+%d" % (x, y))

        # add Label with text
        tmp = text if str(self.widget['state']) != "disabled" else alt_text
        label = Label(tw, text=tmp, justify="left", relief="solid", borderwidth=0.5)
        label.pack(ipadx=1)

    def hidetip(self):
        # destroy Toplevel
        tw = self.tip_window
        self.tip_window = None
        if tw:
            tw.destroy()


def create_tooltip(widget: [Label, Checkbutton, Combobox, Entry, Button, Radiobutton] = None,
                   text: str = None):
    """Create tooltip for any widget.
    Example: create_tooltip(some_widget, text="Test Message")

    :param widget: widget to attach tooltip to
    :param text: Text to display on active widget
    """
    tool_tip = ToolTip(widget)

    alt_text = "This functionality requires a loaded Excel/TSV file"
    if widget.db_w and not widget.atc_w and not widget.mesh_w:
        alt_text = "This functionality requires a loaded database"
    elif widget.mesh_w and not widget.atc_w:
        alt_text += " containing MeSH data"
    elif widget.atc_w and not widget.mesh_w:
        alt_text += " containing ATC data"

    # individual tooltips when tooltip text contains "ALT:"
    if "ALT:" in text:
        text, alt_text = text.split("ALT:")

    def enter(_event):
        try:
            # add 1 space to beginning of each line and at the end; show tooltip
            tt = str(" {}".format(" \n ".join(text.split("\n")))
                     if text.find("\n") != -1 else f" {text} ")
            alt = str(" {}".format(" \n ".join(alt_text.split("\n")))
                      if alt_text.find("\n") != -1 else f" {alt_text} ")
            tool_tip.showtip(tt, alt)
        except Exception as e:
            print(e)

    def leave(_event):
        tool_tip.hidetip()

    widget.bind('<Enter>', enter)
    widget.bind('<Leave>', leave)


def update_tooltip(widget: [Label, Checkbutton, Combobox, Entry, Button, Radiobutton] = None,
                   text: str = None):
    """Update the text of TopLevel.Label of an open tooltip
    (if re-creation is not an option, e.g. at checkboxes)
    """
    widget.winfo_children()[0].winfo_children()[0]["text"] = text


def exception_as_popup(func: callable = None):
    """Decorator to show occurring exceptions as popup"""
    def wrapper(*args, **kwargs):
        try:
            ret = func(*args, **kwargs)
            return ret
        except Exception as e:
            _args = " ".join([str(_) for _ in e.args])
            messagebox.showerror(f"Error: {_args}", f"{_args}\n\n{'*' * 30}\n\n{format_exc()}")
    return wrapper


class App(Tk):
    def __init__(self):
        """Main App Initialization"""
        super().__init__()
        self.title("OntoloViz GUI")
        self.resizable(False, False)

        # style definitions
        purple = "#9998AF"
        blue = "#8CA6D9"
        green = "#A6D98C"
        bold_normal = ("Arial", 9, "bold")
        bold_large = ("Arial", 10, "bold")
        bold_xlarge = ("Arial", 16, "bold")
        self.style = Style()
        self.style.configure("big.TButton", font=bold_normal)
        self.style.configure("green.TButton", font=bold_large, background=green)
        self.style.configure("big.TLabelframe", font=bold_large)
        self.style.configure("blue.TLabelframe", background=blue)
        self.style.configure("blue.TLabelframe.Label", font=bold_large, background=blue)
        self.style.configure("blue_sub.TLabelframe", background=blue)
        self.style.configure("blue_sub.TLabelframe.Label", background=blue)
        self.style.configure("blue.TFrame", background=blue)
        self.style.configure("blue.TLabel", background=blue)
        self.style.configure("blue.TButton", font=bold_large, background=blue)
        self.style.configure("blue.TCheckbutton", background=blue, activebackground=blue)
        self.style.configure("blue.TRadiobutton", background=blue, activebackground=blue)
        self.style.configure("purple.TLabelframe", background=purple)
        self.style.configure("purple.TLabelframe.Label", font=bold_large, background=purple)
        self.style.configure("purple_sub.TLabelframe", background=purple)
        self.style.configure("purple_sub.TLabelframe.Label", background=purple)
        self.style.configure("purple.TFrame", background=purple)
        self.style.configure("purple.TLabel", background=purple)
        self.style.configure("purple.TButton", font=bold_large, background=purple)
        self.style.configure("purple.TCheckbutton", background=purple, activebackground=purple)
        self.style.configure("purple.TRadiobutton", background=purple, activebackground=purple)
        self.style.configure("header_blue.TLabel", font=bold_xlarge, foreground="#396DD6")
        self.style.configure("header_purple.TLabel", font=bold_xlarge, foreground="#706CB5")

        # core variables
        self.p = PhenotypeSunburst()
        self.d = DrugSunburst()

        # memory variables (settings)
        self.database_var = StringVar()
        self.color_scale_var = StringVar(value='[[0, "#FFFFFF"], [0.2, "#403C53"], [1, "#C33D35"]]')
        self.show_border_var = BooleanVar(value=True)
        self.border_color = StringVar(value="rgba(0,0,0,0.25)")
        self.border_width = StringVar(value="1")
        self.export_plot_var = BooleanVar(value=False)
        self.mesh_data_sources = ["Utilization Tuple: Semantic Direct",
                                  "Utilization Tuple: Semantic Indirect",
                                  "Utilization Tuple: Explicit Direct",
                                  "Utilization Tuple: Explicit Indirect"]
        self.mesh_data_source_var = StringVar(value=self.mesh_data_sources[0])
        self.mesh_drop_empty_var = BooleanVar(value=False)
        self.mesh_propagate_enabled_control = BooleanVar(value=False)
        self.mesh_propagate_enable = None  # Checkbutton
        self.mesh_propagate_lvl_var = IntVar(value=0)
        self.mesh_propagate_lvl_lbl = None  # label 'Level: '
        self.mesh_propagate_lvl = None  # Combobox
        self.mesh_propagate_color_var = StringVar(value="specific")
        self.mesh_propagate_color = None  # Combobox
        self.mesh_propagate_color_lbl = None
        self.mesh_propagate_counts_var = StringVar(value="off")
        self.mesh_propagate_counts = None  # Combobox
        self.mesh_propagate_counts_lbl = None
        self.mesh_label_var = StringVar(value="all")
        self.mesh_asset_var = StringVar()
        self.mesh_summary_plot_var = IntVar(value=0)  # stores values from entry
        self.mesh_summary_plot_control = BooleanVar(value=False)  # controls enabling of entry
        self.mesh_summary_plot = None  # checkbox widget
        self.mesh_summary_plot_cols = None  # entry widget
        self.mesh_summary_plot_lbl = None  # label 'Columns: '
        self.atc_data_sources = ["Linked Tuple"]
        self.atc_data_source_var = StringVar(value=self.atc_data_sources[0])
        self.atc_propagate_enabled_control = BooleanVar(value=False)
        self.atc_propagate_enable = None  # Checkbutton
        self.atc_propagate_lvl_var = IntVar(value=5)
        self.atc_propagate_lvl_lbl = None  # label 'Level: '
        self.atc_propagate_lvl = None  # Combobox
        self.atc_propagate_color_var = StringVar(value="specific")
        self.atc_propagate_color = None  # Combobox
        self.atc_propagate_color_lbl = None
        self.atc_propagate_counts_var = StringVar(value="off")
        self.atc_propagate_counts = None  # Combobox
        self.atc_propagate_counts_lbl = None
        self.atc_label_var = StringVar(value="all")
        self.atc_wedge_width_var = StringVar(value="total")
        self.atc_asset_var = StringVar()
        self.atc_summary_plot_var = IntVar(value=0)
        self.atc_summary_plot_control = BooleanVar(value=False)
        self.atc_summary_plot = None
        self.atc_summary_plot_cols = None
        self.atc_summary_plot_lbl = None
        self.loaded_settings = {}
        self.status_var = StringVar()
        self.mesh_frame = None
        self.atc_frame = None
        self.status_frame = None
        self.recent_ui_toggle_mode = None
        self.color_scale = None
        self.color_scale_tt_template = None
        self.show_border = None
        self.show_border_tt_template = None
        self.load_file_btn = None
        self.atc_file_loaded = ""
        self.mesh_file_loaded = ""

        # various
        self.alt_text_db = "This functionality requires a valid database"
        self.alt_text = "This functionality requires a valid database or a loaded file"

        # function calls
        self.build_base_ui()
        self.toggle_widgets(enable=False, mode="db")

    def build_base_ui(self):
        """Builds the base graphical UI elements to load a file"""

        # ######################################### Options Frame ################################ #

        options_frm = Frame(self, style="big.TLabelframe")
        options_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both", expand=True)

        # load file
        self.load_file_btn = Button(options_frm, text="Load File", command=self.load_file,
                                    style="green.TButton")
        self.load_file_btn.pack(side="left", padx=2)
        create_tooltip(self.load_file_btn,
                       "Load an Excel or .tsv file with ATC- or MeSH-tree data."
                       "\n - ATC-Tree: counts for non-drug levels (1-4) will be recalculated and "
                       "overwritten if a parents value does not match all child values."
                       "\n - ATC-Tree: custom colors are not applied when propagation is active"
                       "\n - Excel files remember settings, .tsv files always load defaults")

        # set color scale
        self.color_scale = Button(options_frm, text="Set Color Scale", db_w=True, mesh_w=True,
                                  atc_w=True, command=lambda: ColorScalePopup(self))
        self.color_scale.pack(side="left", padx=2)
        self.color_scale_tt_template = str("Define a custom color scale for the sunburst.\n"
                                           "Requires active propagation, overwrites colors defined "
                                           "in file. \nCurrent scale: ")
        create_tooltip(self.color_scale, self.color_scale_tt_template + self.color_scale_var.get())

        # show border
        self.show_border = Button(options_frm, text="Set Border", command=lambda: BorderPopup(self),
                                  db_w=True, mesh_w=True, atc_w=True)
        self.show_border.pack(side="left", padx=2)
        self.show_border_tt_template = "Configure the border drawn around the sunburst wedges"
        create_tooltip(self.show_border,
                       self.show_border_tt_template + "\nCurrent properties: Color: "
                       + self.border_color.get() + ", Width: " + self.border_width.get())

        # export plot
        export_plot = Checkbutton(options_frm, text="Save Plot", variable=self.export_plot_var,
                                  db_w=True, mesh_w=True, atc_w=True)
        export_plot.pack(side="left", padx=2)
        create_tooltip(export_plot, "Save the generated plots as interactive .html files "
                                    "for later use")

        self.mesh_frame = Frame(self)
        self.mesh_frame.pack(fill="both")

        self.atc_frame = Frame(self)
        self.atc_frame.pack(fill="both")

        # ###################################### STATUS AT BOTTOM ################################ #

        self.status_frame = LabelFrame(self, text="Status")
        self.status_frame.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")

        # query data frame
        status = Label(self.status_frame, textvariable=self.status_var)
        status.pack(side="right", padx=2)

    def build_mesh_ui(self, db_functions: bool = None):
        """Builds MeSH-phenotype specific controls if proper file was loaded

        :param db_functions: if True, database related widgets are generated
        """
        # ###################################### PHENOTYPE/MESH SUNBURST ######################### #

        # top frame
        p_frm = LabelFrame(self.mesh_frame, text="Phenotype Sunburst", style="blue.TLabelframe")
        p_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")

        if db_functions:
            # query data frame
            mesh_data_frm = LabelFrame(p_frm, text="Query Data", style="blue_sub.TLabelframe")
            mesh_data_frm.pack(ipadx=2, ipady=2, padx=4, pady=2, anchor="w")

            # asset subframe
            mesh_asset_frm = Frame(mesh_data_frm, style="blue.TFrame")
            mesh_asset_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")
            mesh_asset_label = Label(mesh_asset_frm, text="Asset name:", style="blue.TLabel",
                                     db_w=True, width=12)
            mesh_asset_label.pack(side="left", padx=2)
            mesh_asset = Entry(mesh_asset_frm, db_w=True, textvariable=self.mesh_asset_var,
                               width=40)
            mesh_asset.pack(side="left", padx=(2, 10))
            create_tooltip(mesh_asset, "Enter drug name name (e.g. aspirin, case insensitive)")

            # data source subframe
            mesh_data_source_frm = Frame(mesh_data_frm, style="blue.TFrame")
            mesh_data_source_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")
            mesh_data_source_label = Label(mesh_data_source_frm, text="Data source:",
                                           style="blue.TLabel", db_w=True, width=12)
            mesh_data_source_label.pack(side="left", padx=2)
            mesh_data_source = Combobox(mesh_data_source_frm,
                                        textvariable=self.mesh_data_source_var,
                                        values=self.mesh_data_sources, state="readonly", db_w=True,
                                        width=max([len(_) for _ in self.mesh_data_sources]))
            mesh_data_source.pack(side="left", padx=2, fill="x", expand=True)
            create_tooltip(mesh_data_source, "Select data source")

        # frame for options
        p_options_frm = Frame(p_frm, style="blue.TFrame")
        p_options_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")

        # display options subframe
        mesh_display_options_frm = LabelFrame(p_options_frm, text="Display",
                                              style="blue_sub.TLabelframe")
        mesh_display_options_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")

        # drop empty last child
        mesh_drop_empty = Checkbutton(mesh_display_options_frm, text="Drop empty",
                                      variable=self.mesh_drop_empty_var, onvalue=True,
                                      offvalue=False, style="blue.TCheckbutton", db_w=True,
                                      mesh_w=True)
        mesh_drop_empty.pack(side="left", padx=2)
        create_tooltip(mesh_drop_empty, "Drop nodes who have no further children and 0 counts")

        # labels ('all', 'propagate', 'none')
        mesh_label_label = Label(mesh_display_options_frm, text="Labels:", style="blue.TLabel",
                                 db_w=True, mesh_w=True)
        mesh_label_label.pack(side="left", padx=2)

        mesh_label = Combobox(mesh_display_options_frm, textvariable=self.mesh_label_var,
                              state="readonly", width=11, values=["all", "propagation", "none"],
                              db_w=True, mesh_w=True)
        mesh_label.pack(side="left", padx=2)
        create_tooltip(mesh_label, "Enables/Disables display of labels inside sunburst wedges")

        # summary plot subframe
        mesh_summary_plot_frm = LabelFrame(p_options_frm, text="Summary Plot",
                                           style="blue_sub.TLabelframe")
        mesh_summary_plot_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")

        # checkbutton to toggle overview / detailed view
        self.mesh_summary_plot_cols = Entry(mesh_summary_plot_frm, width=2, validate="focusout",
                                            validatecommand=partial(self.overview_entry_validation,
                                                                    "mesh"))
        self.mesh_summary_plot_cols.insert(0, "5")
        self.mesh_summary_plot_cols.configure(state="disabled")
        self.mesh_summary_plot_control.set(False)
        self.mesh_summary_plot = Checkbutton(mesh_summary_plot_frm, text="Enable",
                                             style="blue.TCheckbutton", db_w=True, mesh_w=True,
                                             variable=self.mesh_summary_plot_control, onvalue=True,
                                             offvalue=False,
                                             command=partial(self.checkbox_controller,
                                                             "mesh_summary_plot"))
        self.mesh_summary_plot.pack(side="left", padx=2)
        self.mesh_summary_plot_lbl = Label(mesh_summary_plot_frm, text="Columns: ",
                                           style="blue.TLabel")
        self.mesh_summary_plot_lbl.configure(state="disabled")
        self.mesh_summary_plot_lbl.pack(side="left", padx=2)
        self.mesh_summary_plot_cols.pack(side="left", padx=2)
        create_tooltip(self.mesh_summary_plot_cols,
                       "Enter amount of columns in range (1..20)ALT:Enable 'Summary Plot' "
                       "to modify amount of columns")
        create_tooltip(self.mesh_summary_plot,
                       "Select to plot all data in a combined overview (resource intensive, "
                       "set Labels to 'none' for faster loading)")

        # propagation subframe
        mesh_propagate_frm = LabelFrame(p_options_frm, text="Propagation",
                                        style="blue_sub.TLabelframe")
        mesh_propagate_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")
        self.mesh_propagate_enabled_control.set(False)
        self.mesh_propagate_enable = Checkbutton(mesh_propagate_frm, text="Enable",
                                           style="blue.TCheckbutton", db_w=True, mesh_w=True,
                                           onvalue=True, offvalue=False,
                                           variable=self.mesh_propagate_enabled_control,
                                           command=partial(self.checkbox_controller,
                                                           "mesh_propagate"))
        self.mesh_propagate_enable.pack(side="left", padx=2)
        create_tooltip(self.mesh_propagate_enable,
                       "Select to enable propagation of counts and colors based on ontology level")

        # propagate color specificity
        self.mesh_propagate_color_lbl = Label(mesh_propagate_frm, text="Color:",
                                              style="blue.TLabel")
        self.mesh_propagate_color_lbl.pack(side="left", padx=2)
        self.mesh_propagate_color_lbl.configure(state="disabled")
        create_tooltip(self.mesh_propagate_color_lbl,
                       "off: Color scale is based on 'Color' column from imported file\n"
                       "specific: Color scale is based on the max values of the corresponding "
                       "tree\n"
                       "phenotype: Only the most outer phenotype in a branch is colored\n"
                       "global: Color scale is based on the max values of the entire mesh ontology"
                       "ALT:Enable 'Propagation' to modify propagation color specificity")
        self.mesh_propagate_color = Combobox(mesh_propagate_frm,
                                             textvariable=self.mesh_propagate_color_var,
                                             width=10,
                                             state="readonly",
                                             values=["off", "specific", "global", "phenotype"])
        self.mesh_propagate_color.pack(side="left", padx=2)
        self.mesh_propagate_color.configure(state="disabled")
        create_tooltip(self.mesh_propagate_color,
                       "off: Color scale is based on 'Color' column from imported file\n"
                       "specific: Color scale is based on the max values of the corresponding "
                       "tree\n"
                       "global: Color scale is based on the max values of the entire mesh "
                       "ontology\n"
                       "phenotype: Only the most outer phenotype in a branch is colored"
                       "ALT:Enable 'Propagation' to modify propagation color specificity")

        # propagate counts
        self.mesh_propagate_counts_lbl = Label(mesh_propagate_frm, text="Counts:",
                                               style="blue.TLabel")
        self.mesh_propagate_counts_lbl.pack(side="left", padx=2)
        self.mesh_propagate_counts_lbl.configure(state="disabled")
        create_tooltip(self.mesh_propagate_counts_lbl,
                       "off: no counts are propagated, counts equal imported values\n"
                       "level: counts are propagated up to defined level, values above threshold "
                       "remain unchanged\n"
                       "all: counts are propagated up to central node, imported values are "
                       "corrected and overwritten\n"
                       "ALT: Enable 'Propagation' to modify propagation counts")
        self.mesh_propagate_counts = Combobox(mesh_propagate_frm,
                                              textvariable=self.mesh_propagate_counts_var,
                                              state="readonly",
                                              values=["off", "level", "all"],
                                              width=4)
        self.mesh_propagate_counts.pack(side="left", padx=2)
        self.mesh_propagate_counts.configure(state="disabled")
        create_tooltip(self.mesh_propagate_counts,
                       "off: no counts are propagated, counts equal imported values\n"
                       "level: counts are propagated up to defined level, values above threshold "
                       "remain unchanged\n"
                       "all: counts are propagated up to central node, imported values are "
                       "corrected and overwritten\n"
                       "ALT: Enable 'Propagation' to modify propagation counts")

        # propagate level
        self.mesh_propagate_lvl_lbl = Label(mesh_propagate_frm, text="Level: ", style="blue.TLabel")
        self.mesh_propagate_lvl_lbl.pack(side="left", padx=2)
        self.mesh_propagate_lvl_lbl.configure(state="disabled")
        self.mesh_propagate_lvl = Combobox(mesh_propagate_frm,
                                           textvariable=self.mesh_propagate_lvl_var,
                                           width=3,
                                           state="readonly",
                                           values=[str(_) for _ in range(0, 14, 1)])
        self.mesh_propagate_lvl.pack(side="left", padx=2)
        self.mesh_propagate_lvl.configure(state="disabled")
        create_tooltip(self.mesh_propagate_lvl, "Propagate from outer to inner levels up to "
                                                "defined level\n"
                                                "0 corresponds to the central node, 13 to the "
                                                "outermost node\n"
                                                "---\n"
                                                "affects color propagation when set to "
                                                "'specific' or 'global'\n"
                                                "affects count propagation when set to 'level'"
                                                "ALT:Enable 'Propagation' to modify "
                                                "propagation level")

        # run buttons frame
        p_run_frm = Frame(p_frm, style="blue.TFrame")
        p_run_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="x")

        # plot button
        mesh_plot = Button(p_run_frm, text="Plot", style="blue.TButton",
                           command=partial(self.plot, "mesh"), db_w=True, mesh_w=True)
        mesh_plot.pack(side="right", padx=2)
        create_tooltip(mesh_plot, "Plot Sunburst based on selected data-source and asset. "
                                  "If Export Plot is checked, interactive sunburst will be "
                                  "available as .html file for later use")

        if db_functions:
            # export button
            mesh_export = Button(p_run_frm, text="Export", style="blue.TButton",
                                 command=self.mesh_export, db_w=True)
            mesh_export.pack(side="right", padx=2)
            create_tooltip(mesh_export, "Generate Sunburst data without plotting, export to Excel "
                                        "for later use / customization")

    def build_atc_ui(self, db_functions: bool = None):
        """Builds ATC-drug specific controls if proper file was loaded

        :param db_functions: if True, database related widgets are generated
        """

        # ###################################### DRUG/ATC SUNBURST ############################### #

        # top frame
        d_frm = LabelFrame(self.atc_frame, text="Drug Sunburst", style="purple.TLabelframe")
        d_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")

        if db_functions:
            # query data frame
            atc_data_frm = LabelFrame(d_frm, text="Query Data", style="purple_sub.TLabelframe")
            atc_data_frm.pack(ipadx=2, ipady=2, padx=4, pady=2, anchor="w")

            # asset subframe
            atc_asset_frm = Frame(atc_data_frm, style="purple.TFrame")
            atc_asset_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")
            atc_asset_label = Label(atc_asset_frm, text="Asset name:", style="purple.TLabel",
                                    db_w=True, width=12)
            atc_asset_label.pack(side="left", padx=2)
            atc_asset = Entry(atc_asset_frm, db_w=True, textvariable=self.atc_asset_var, width=40)
            atc_asset.pack(side="left", padx=(2, 10))
            create_tooltip(atc_asset, "Enter phenotype name (e.g. headache, case insensitive)")

            # data source subframe
            atc_data_source_frm = Frame(atc_data_frm, style="purple.TFrame")
            atc_data_source_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")
            atc_data_source_label = Label(atc_data_source_frm, text="Data source:",
                                          style="purple.TLabel", db_w=True, width=12)
            atc_data_source_label.pack(side="left", padx=2)
            atc_data_source = Combobox(atc_data_source_frm,
                                       textvariable=self.atc_data_source_var,
                                       values=self.atc_data_sources,
                                       state="readonly",
                                       width=max([len(_) for _ in self.atc_data_sources]),
                                       db_w=True)
            atc_data_source.pack(side="left", padx=2, fill="x", expand=True)
            create_tooltip(atc_data_source, "Select data source")

        # frame for options
        d_options_frm = Frame(d_frm, style="purple.TFrame")
        d_options_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")

        # display options subframe
        atc_display_options_frm = LabelFrame(d_options_frm, text="Display",
                                             style="purple_sub.TLabelframe")
        atc_display_options_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")

        # labels
        atc_label_label = Label(atc_display_options_frm, text="Labels:", style="purple.TLabel",
                                db_w=True, atc_w=True)
        atc_label_label.pack(side="left", padx=2)
        atc_label = Combobox(atc_display_options_frm,
                             textvariable=self.atc_label_var,
                             state="readonly",
                             width=11,
                             values=["all", "propagation", "drugs", "none"],
                             db_w=True,
                             atc_w=True)
        atc_label.pack(side="left", padx=2)
        create_tooltip(atc_label, "Enables/Disables display of labels inside sunburst wedges")

        # wedge width
        atc_wedge_width_label = Label(atc_display_options_frm, text="Wedge Width:",
                                      style="purple.TLabel", db_w=True, atc_w=True)
        atc_wedge_width_label.pack(side="left", padx=2)
        atc_wedge_width = Combobox(atc_display_options_frm,
                                   textvariable=self.atc_wedge_width_var,
                                   state="readonly",
                                   width=9,
                                   values=["total", "remainder"],
                                   db_w=True,
                                   atc_w=True)
        atc_wedge_width.pack(side="left", padx=2)
        create_tooltip(atc_wedge_width,
                       "Change the sunburst display option from a full outer circle (total)"
                       " to count-based wedge-widths (remainder)")

        # summary plot subframe
        atc_summary_plot_frm = LabelFrame(d_options_frm, text="Summary Plot",
                                          style="purple_sub.TLabelframe")
        atc_summary_plot_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")

        # checkbutton to toggle overview / detailed view
        self.atc_summary_plot_cols = Entry(atc_summary_plot_frm, width=2, validate="focusout",
                                           validatecommand=partial(self.overview_entry_validation,
                                                                   "atc"))
        self.atc_summary_plot_cols.insert(0, "5")
        self.atc_summary_plot_cols.configure(state="disabled")
        self.atc_summary_plot_control.set(False)
        self.atc_summary_plot = Checkbutton(atc_summary_plot_frm,
                                            text="Enable",
                                            style="purple.TCheckbutton",
                                            db_w=True,
                                            atc_w=True,
                                            variable=self.atc_summary_plot_control,
                                            onvalue=True,
                                            offvalue=False,
                                            command=partial(self.checkbox_controller,
                                                            "atc_summary_plot"))
        self.atc_summary_plot.pack(side="left", padx=2)
        self.atc_summary_plot_lbl = Label(atc_summary_plot_frm, text="Columns: ",
                                          style="purple.TLabel")
        self.atc_summary_plot_lbl.configure(state="disabled")
        self.atc_summary_plot_lbl.pack(side="left", padx=2)
        self.atc_summary_plot_cols.pack(side="left", padx=2)
        create_tooltip(self.atc_summary_plot_cols,
                       "Enter amount of columns in range (1..20)ALT:Enable 'Summary Plot' "
                       "to modify amount of columns")
        create_tooltip(self.atc_summary_plot,
                       "Select to plot all data in a combined overview (resource intensive, "
                       "set Labels to 'none' for faster loading)")

        # propagation subframe
        atc_propagate_frm = LabelFrame(d_options_frm, text="Propagation",
                                       style="purple_sub.TLabelframe")
        atc_propagate_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")
        self.atc_propagate_enabled_control.set(False)
        self.atc_propagate_enable = Checkbutton(atc_propagate_frm,
                                                text="Enable",
                                                style="purple.TCheckbutton",
                                                db_w=True,
                                                atc_w=True,
                                                onvalue=True,
                                                offvalue=False,
                                                variable=self.atc_propagate_enabled_control,
                                                command=partial(self.checkbox_controller,
                                                                "atc_propagate"))
        self.atc_propagate_enable.pack(side="left", padx=2)
        create_tooltip(self.atc_propagate_enable,
                       "Select to enable propagation of counts and colors based on ontology level")
        # propagate color specificity
        self.atc_propagate_color_lbl = Label(atc_propagate_frm, text="Color:",
                                             style="purple.TLabel")
        self.atc_propagate_color_lbl.pack(side="left", padx=2)
        self.atc_propagate_color_lbl.configure(state="disabled")
        create_tooltip(self.atc_propagate_color_lbl,
                       "off: Color scale is based on 'Color' column from imported file\n"
                       "specific: Color scale is based on the maximum values of the "
                       "corresponding tree\n"
                       "global: Color scale is based on the maximum values of the "
                       "entire mesh ontology"
                       "ALT:Enable 'Propagation' to modify propagation color specificity")
        self.atc_propagate_color = Combobox(atc_propagate_frm,
                                            textvariable=self.atc_propagate_color_var,
                                            state="readonly",
                                            values=["off", "specific", "global"],
                                            width=10)
        self.atc_propagate_color.pack(side="left", padx=2)
        self.atc_propagate_color.configure(state="disabled")
        create_tooltip(self.atc_propagate_color,
                       "off: Color scale is based on 'Color' column from imported file\n"
                       "specific: Color scale is based on the maximum values of the "
                       "corresponding tree\n"
                       "global: Color scale is based on the maximum values of the "
                       "entire mesh ontology"
                       "ALT:Enable 'Propagation' to modify propagation color specificity")

        # propagate counts
        self.atc_propagate_counts_lbl = Label(atc_propagate_frm, text="Counts:",
                                              style="purple.TLabel")
        self.atc_propagate_counts_lbl.pack(side="left", padx=2)
        self.atc_propagate_counts_lbl.configure(state="disabled")
        create_tooltip(self.atc_propagate_counts_lbl,
                       "off: no counts are propagated, counts equal imported values\n"
                       "level: counts are propagated up to defined level, values above threshold "
                       "remain unchanged\n"
                       "all: counts are propagated up to central node, imported values are "
                       "corrected and overwritten\n"
                       "ALT: Enable 'Propagation' to modify propagation counts")
        self.atc_propagate_counts = Combobox(atc_propagate_frm,
                                             textvariable=self.atc_propagate_counts_var,
                                             state="readonly",
                                             values=["off", "level", "all"],
                                             width=4)
        self.atc_propagate_counts.pack(side="left", padx=2)
        self.atc_propagate_counts.configure(state="disabled")
        create_tooltip(self.atc_propagate_counts,
                       "off: no counts are propagated, counts equal imported values\n"
                       "level: counts are propagated up to defined level, values above "
                       "threshold remain unchanged\n"
                       "all: counts are propagated up to central node, imported values are "
                       "corrected and overwritten\n"
                       "ALT: Enable 'Propagation' to modify propagation counts")

        # propagate level
        self.atc_propagate_lvl_lbl = Label(atc_propagate_frm, text="Level: ", style="purple.TLabel")
        self.atc_propagate_lvl_lbl.pack(side="left", padx=2)
        self.atc_propagate_lvl_lbl.configure(state="disabled")
        self.atc_propagate_lvl = Combobox(atc_propagate_frm,
                                          textvariable=self.atc_propagate_lvl_var,
                                          width=3,
                                          state="readonly",
                                          values=[str(_) for _ in range(0, 6, 1) if _ != 0])
        self.atc_propagate_lvl.pack(side="left", padx=2)
        self.atc_propagate_lvl.configure(state="disabled")
        create_tooltip(self.atc_propagate_lvl, "Propagate colors to defined level "
                                               "from outer to inner levels\n"
                                               "---\n"
                                               "affects color propagation when set to "
                                               "'specific' or 'global'\n"
                                               "affects count propagation when set to 'level'"
                                               "ALT:Enable 'Propagation' to modify "
                                               "propagation level")

        # run buttons frame
        d_run_frm = Frame(d_frm, style="purple.TFrame")
        d_run_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="x")

        # plot
        atc_plot = Button(d_run_frm, text="Plot", style="purple.TButton",
                          command=partial(self.plot, "atc"),
                          db_w=True, atc_w=True)
        atc_plot.pack(side="right", padx=2)
        create_tooltip(atc_plot,
                       "Plot Sunburst based on selected data-source and asset. If Export Plot is "
                       "checked, interactive sunburst will be available as .html file for later "
                       "use")

        if db_functions:
            # export
            atc_export = Button(d_run_frm, text="Export", style="purple.TButton",
                                command=self.atc_export, db_w=True)
            atc_export.pack(side="right", padx=2)

    def checkbox_controller(self, mode: str = None):
        """Toggles widgets based on state of a BooleanVar

        :param mode: must be in ['mesh_summary_plot', 'mesh_propagate', 'atc_summary_plot',
                                 'atc_propagate']
        """
        checkbox, toggle_widgets, var_entry_int_pairs = None, [], []
        if mode == "atc_summary_plot":
            checkbox = self.atc_summary_plot_control
            toggle_widgets = [self.atc_summary_plot_cols, self.atc_summary_plot_lbl]
            var_entry_int_pairs = [(self.atc_summary_plot_var, self.atc_summary_plot_cols)]
        elif mode == "atc_propagate":
            checkbox = self.atc_propagate_enabled_control
            toggle_widgets = [self.atc_propagate_lvl_lbl, self.atc_propagate_lvl,
                              self.atc_propagate_color_lbl, self.atc_propagate_color,
                              self.atc_propagate_counts_lbl, self.atc_propagate_counts]
        elif mode == "mesh_summary_plot":
            checkbox = self.mesh_summary_plot_control
            toggle_widgets = [self.mesh_summary_plot_cols, self.mesh_summary_plot_lbl]
            var_entry_int_pairs = [(self.mesh_summary_plot_var, self.mesh_summary_plot_cols)]
        elif mode == "mesh_propagate":
            checkbox = self.mesh_propagate_enabled_control
            toggle_widgets = [self.mesh_propagate_lvl_lbl, self.mesh_propagate_lvl,
                              self.mesh_propagate_color_lbl, self.mesh_propagate_color,
                              self.mesh_propagate_counts_lbl, self.mesh_propagate_counts]

        for widget in toggle_widgets:
            if checkbox.get():
                widget.configure(state="readonly" if isinstance(widget, Combobox) else "normal")
            else:
                widget.configure(state="disabled")

        for var_entry in var_entry_int_pairs:
            if checkbox.get():
                var_entry[0].set(int(var_entry[1].get()))
            else:
                var_entry[0].set(0)

        if not checkbox.get():
            self.set_status("")

    def toggle_checkbox_widgets(self, mode: str = None, enable: bool = None):
        """Toggles all checkbox related widgets (not part of toggle_widgets routine)

        :param mode: Must be in ['mesh', 'atc']
        :param enable: True to enable, False to disable
        """
        controller_widgets = None
        if mode == "mesh":
            controller_widgets = [self.mesh_propagate_enable, self.mesh_summary_plot]
        elif mode == "atc":
            controller_widgets = [self.atc_propagate_enable, self.atc_summary_plot]

        if enable:
            for widget in controller_widgets:
                widget.configure(state="normal")

            # call checkbox controller for respective toggling of children
            if mode == "mesh":
                self.checkbox_controller(mode="mesh_summary_plot")
                self.checkbox_controller(mode="mesh_propagate")
            elif mode == "atc":
                self.checkbox_controller(mode="atc_summary_plot")
                self.checkbox_controller(mode="atc_propagate")

        else:
            # iterate over controller widgets, disable children within the controller widgets frame
            for cw in controller_widgets:
                for child in cw.master.winfo_children():
                    child.configure(state="disabled")

    def overview_entry_validation(self, mode: str = None):
        """Validates Entry used for defining columns for Overview plot

        :param mode: String, must be 'mesh' or 'atc'
        """
        failed = False
        entry, target_var, target_value = None, None, None

        if mode == "atc":
            entry = self.atc_summary_plot_cols
            target_var = self.atc_summary_plot_var
        elif mode == "mesh":
            entry = self.mesh_summary_plot_cols
            target_var = self.mesh_summary_plot_var

        try:
            target_value = int(entry.get())
        except ValueError:
            failed = True

        if not failed and (target_value <= 0 or target_value > 20):
            failed = True

        if failed:
            self.set_status("ERROR - only integers > 0 and < 20 allowed")
            entry.delete(0, END)
            entry.insert(0, "5")
            return False

        target_var.set(target_value)
        self.set_status("")
        return False

    def check_init(self, obj: [PhenotypeSunburst, DrugSunburst] = None) -> bool:
        """Checks if core objects are initialized

        :param obj: core object
        :returns: True if initialization was successful
        """
        if not os.path.isfile(self.database_var.get()):
            self.set_database()
        if not os.path.isfile(self.database_var.get()):
            messagebox.showerror("Database", "Could not initialize database, "
                                             "'Export' and 'Plot' functionalities disabled")
            return False

        if not obj.is_init:
            if isinstance(obj, PhenotypeSunburst):
                self.set_status("Initializing MeSH-tree ..")
                self.p.init(self.database_var.get())
            elif isinstance(obj, DrugSunburst):
                self.set_status("Initializing ATC-tree ..")
                self.d.init(self.database_var.get())

        return obj.is_init

    def set_status(self, text: str = None):
        """Set global status in GUI
        :param text: Text to display as status message
        """
        self.status_var.set("\n".join(textwrap.wrap(text, 75)))
        self.update()

    def configure_p(self):
        """Hand over GUI settings to PhenotypeSunburst object"""
        self.p.set_color_scale(json.loads(self.color_scale_var.get().replace("'", '"')))
        self.p.set_settings({
            "show_border": self.show_border_var.get(),
            "border_color": self.border_color.get(),
            "border_width": float(self.border_width.get()),
            "export_plot": self.export_plot_var.get(),
            "mesh_drop_empty_last_child": self.mesh_drop_empty_var.get(),
            "mesh_propagate_enable": bool(self.mesh_propagate_enabled_control.get()),
            "mesh_propagate_lvl": int(self.mesh_propagate_lvl_var.get()),
            "mesh_propagate_color": self.mesh_propagate_color_var.get(),
            "mesh_propagate_counts": self.mesh_propagate_counts_var.get(),
            "mesh_labels": self.mesh_label_var.get(),
            "mesh_summary_plot": self.mesh_summary_plot_var.get(),
        })

    def configure_d(self):
        """Hand over GUI settings to DrugSunburst object"""
        self.d.set_color_scale(json.loads(self.color_scale_var.get().replace("'", '"')))
        self.d.set_settings({
            "show_border": self.show_border_var.get(),
            "border_color": self.border_color.get(),
            "border_width": float(self.border_width.get()),
            "export_plot": self.export_plot_var.get(),
            "atc_propagate_enable": bool(self.atc_propagate_enabled_control.get()),
            "atc_propagate_lvl": int(self.atc_propagate_lvl_var.get()),
            "atc_propagate_color": self.atc_propagate_color_var.get(),
            "atc_propagate_counts": self.atc_propagate_counts_var.get(),
            "atc_labels": self.atc_label_var.get(),
            "atc_wedge_width": self.atc_wedge_width_var.get(),
            "atc_summary_plot": self.atc_summary_plot_var.get()
        })

    def toggle_widgets(self, enable: bool = None, mode: str = None,
                       dedicated_parent: [Frame, LabelFrame] = None):
        """Enables/disables widgets in GUI

        :param enable: True to enable, False to disable
        :param mode: One of ['db', 'mesh', 'atc', 'recent'] - 'recent' requires previous toggling
                     of any other mode
        :param dedicated_parent: Used internally to modify deeper levels
        """
        wdgs = (Button, Checkbutton, Entry, Label, Radiobutton)
        if mode == "recent":
            mode = self.recent_ui_toggle_mode

            # additionally toggle checkbox widgets
            self.toggle_checkbox_widgets(mode=mode, enable=enable)
        else:
            self.recent_ui_toggle_mode = mode

        if enable:
            state = "normal"
            combo_state = "readonly"
        else:
            state = combo_state = "disabled"

        if not dedicated_parent:
            parent = self
        else:
            parent = dedicated_parent

        for obj in parent.winfo_children():

            # set state of direct children
            for child in obj.winfo_children():
                if isinstance(child, wdgs):
                    if mode == "db" and child.db_w \
                            or mode == "mesh" and child.mesh_w \
                            or mode == "atc" and child.atc_w:
                        child.configure(state=state)
                elif isinstance(child, Combobox):
                    if mode == "db" and child.db_w \
                            or mode == "mesh" and child.mesh_w \
                            or mode == "atc" and child.atc_w:
                        child.configure(state=combo_state)

                # # go deeper another level  # TODO: make this work
                # else:
                #     self.toggle_widgets(enable, mode, child)

                # go deeper another level
                elif isinstance(child, (LabelFrame, Frame)):
                    for child_two in child.winfo_children():
                        if isinstance(child_two, wdgs):
                            if mode == "db" and child_two.db_w \
                                    or mode == "mesh" and child_two.mesh_w \
                                    or mode == "atc" and child_two.atc_w:
                                child_two.configure(state=state)
                        elif isinstance(child_two, Combobox):
                            if mode == "db" and child_two.db_w \
                                    or mode == "mesh" and child_two.mesh_w \
                                    or mode == "atc" and child_two.atc_w:
                                child_two.configure(state=combo_state)

                        # go deeper another level
                        elif isinstance(child_two, (LabelFrame, Frame)):
                            for child_three in child_two.winfo_children():
                                if isinstance(child_three, wdgs):
                                    if mode == "db" and child_three.db_w \
                                            or mode == "mesh" and child_three.mesh_w \
                                            or mode == "atc" and child_three.atc_w:
                                        child_three.configure(state=state)
                                elif isinstance(child_three, Combobox):
                                    if mode == "db" and child_three.db_w \
                                            or mode == "mesh" and child_three.mesh_w \
                                            or mode == "atc" and child_three.atc_w:
                                        child_three.configure(state=combo_state)

                                # go deeper another level
                                elif isinstance(child_three, (LabelFrame, Frame)):
                                    for child_four in child_three.winfo_children():
                                        if isinstance(child_four, wdgs):
                                            if mode == "db" and child_four.db_w \
                                                    or mode == "mesh" and child_four.mesh_w\
                                                    or mode == "atc" and child_four.atc_w:
                                                child_four.configure(state=state)
                                        elif isinstance(child_four, Combobox):
                                            if mode == "db" and child_four.db_w \
                                                    or mode == "mesh" and child_four.mesh_w\
                                                    or mode == "atc" and child_four.atc_w:
                                                child_four.configure(state=combo_state)

        self.update()

    def rollback_ui(self):
        """Removes ATC/MeSH related widgets"""
        self.mesh_frame.destroy()
        self.atc_frame.destroy()
        self.status_frame.destroy()
        self.update()

        self.mesh_frame = Frame(self)
        self.mesh_frame.pack(fill="both")
        self.atc_frame = Frame(self)
        self.atc_frame.pack(fill="both")
        self.status_frame = LabelFrame(self, text="Status")
        self.status_frame.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")
        status = Label(self.status_frame, textvariable=self.status_var)
        status.pack(padx=2)
        self.update()

    def set_database(self, db: str = None):
        """Prompt to set database, extracts .tar.gz or verifies chosen .db file, sets class variable

        :param db: If path to database is given, only integrity is verified without opening a dialog
        """
        if not db:
            db = filedialog.askopenfilename(title="Database", initialdir=os.getcwd(),
                                            filetypes=[("DrugVision SQLite3 database",
                                                        ".db .tar.gz"),
                                                       ("All files", "*")])

        if not db:
            return

        if db.endswith(".db"):
            if self.p.verify_db(db):
                self.database_var.set(db)
                self.build_mesh_ui(db_functions=True)
                self.build_atc_ui(db_functions=True)
                self.update()
                self.toggle_widgets(enable=True, mode="db")
                self.atc_file_loaded = ""
                self.mesh_file_loaded = ""
            else:
                messagebox.showerror("Database", f"Database {db} could not be verified.")

        elif db.endswith(".tar.gz"):
            messagebox.showinfo("Database", "Unpacking database archive .. "
                                            "GUI will be unresponsive until finished")
            with tarfile.open(db, "r:gz") as tar:
                print(f"Extracting {db} ..")
                names = tar.getnames()
                tar.extractall()
            db = db.rstrip(".tar.gz") + ".db"
            if os.path.isfile(db):
                messagebox.showinfo("Database", f"Successfully extracted {db}")
                self.set_database(db)
            else:
                messagebox.showwarning("Database", f"Extracted unknown file: {names[0]} - "
                                                   f"please select the database manually")
                self.set_database()

    @exception_as_popup
    def plot(self, mode: str = None):
        """Populate tree, update settings of core objects, plot and prompt to overwrite file
        if Excel was loaded

        :param mode: Must be in 'atc', 'mesh'
        """
        populate_tsv = None
        populate_excel = None
        populate_data_source = None
        export_tsv = None
        input_fn = None
        obj = None
        configure = None
        asset = None
        datasource = None
        cfg_exclude = ""

        # assign variables based on mode
        if mode == "atc":
            input_fn = self.atc_file_loaded
            populate_data_source = self.d.populate_atc_from_data_source
            populate_tsv = self.d.populate_atc_from_tsv
            populate_excel = self.d.load_atc_excel
            export_tsv = self.d.export_atc_tree
            obj = self.d
            configure = self.configure_d
            asset = self.atc_asset_var.get()
            datasource = self.atc_data_source_var.get()
            cfg_exclude = "mesh_"
        elif mode == "mesh":
            input_fn = self.mesh_file_loaded
            populate_data_source = self.p.populate_mesh_from_data_source
            populate_tsv = self.p.populate_mesh_from_tsv
            populate_excel = self.p.load_mesh_excel
            export_tsv = self.p.export_mesh_tree
            obj = self.p
            configure = self.configure_p
            asset = self.mesh_asset_var.get()
            datasource = self.mesh_data_source_var.get()
            cfg_exclude = "atc_"

        # populate tree from Excel or database data
        self.set_status(f"Populating {mode.upper()} tree ..")
        if input_fn:
            if os.path.splitext(input_fn)[-1] == ".tsv":
                populate_tsv(input_fn)
            else:
                populate_excel(input_fn, read_settings=False, populate=True)
        else:
            if not self.check_init(obj):
                return
            populate_data_source(asset, datasource)

        # update settings of core object based on current GUI configuration
        configure()

        # launch plot creation as thread
        thread = Thread(target=obj.plot, args=())
        thread.start()

        # disable UI
        self.toggle_widgets(enable=False, mode="recent")

        # refresh status based on thread responses
        while thread.is_alive():
            self.set_status(obj.thread_status)
            time.sleep(0.1)

        # enable UI, set final status
        self.toggle_widgets(enable=True, mode="recent")
        self.set_status("Plot displayed in browser")

        # check if thread returned something
        thread_ret = obj.thread_return
        if thread_ret:
            messagebox.showinfo("Export Plot", f"Exported plot to: {thread_ret}")

        # prompt to ask if new template should be generated
        generate_template = messagebox.askyesno(title="Generate template",
                                                message="Generate new template for later use ?")
        if generate_template:
            template_fn = export_tsv(mode="TSV", template=False)
            messagebox.showinfo(title="Generate template",
                                message=f"Generated: {os.path.abspath(template_fn)}")

        # prompt to overwrite Excel file if settings changed since load
        if input_fn and os.path.splitext(input_fn) == ".xlsx":
            accepted = ["color_scale", "show_border", "border_color", "border_width"]
            accepted.extend([_ for _ in self.loaded_settings.keys() if _.startswith(mode)])
            modified = {k: (str(self.loaded_settings[k]), str(obj.s[k]))
                        for k in self.loaded_settings.keys()
                        if str(obj.s[k]) != str(self.loaded_settings[k]) and k in accepted}
            tmp = "\n".join([f"{k}: '{v[0]}' -> '{v[1]}'" for k, v in modified.items()])
            if modified:
                overwrite = messagebox.askokcancel(title="Settings changed",
                                                   message=f"Settings changed, "
                                                           f"overwrite {input_fn} ?\n\n{tmp}")
                if overwrite:
                    s = [(k, v) for k, v in obj.s.items()
                         if not k.startswith(cfg_exclude) and k != "default_color"]
                    out_fn = obj.export_settings(fn=input_fn, settings=s)
                    self.set_status(f"Updated {out_fn}")

    @exception_as_popup
    def mesh_export(self):
        """Update settings of core object, populate and export MeSH-tree to Excel"""
        if not self.check_init(self.p):
            return

        self.configure_p()

        self.set_status("Populating MeSH-tree ..")
        self.p.populate_mesh_from_data_source(drug_name=self.mesh_asset_var.get(),
                                              data_source=self.mesh_data_source_var.get())

        export_popup = ExportPopup(self, "Export as",
                                   "Export MeSH-Tree as Excel (remembers settings) or .tsv file")
        selection = export_popup.selection
        export_as_template = export_popup.export_as_template.get()

        if selection:
            self.set_status(f"Exporting MeSH-tree to {selection} ..")
            export_fn = self.p.export_mesh_tree(mode=selection, template=export_as_template)
            messagebox.showinfo("Export", f"Exported MeSH-tree to: {export_fn}")

        self.set_status("")

    @exception_as_popup
    def atc_export(self):
        """Update settings of core object, populate and export ATC-tree to Excel"""
        if not self.check_init(self.d):
            return

        self.configure_d()

        self.set_status("Populating ATC-tree ..")
        self.d.populate_atc_from_data_source(phenotype_name=self.atc_asset_var.get(),
                                             data_source=self.atc_data_source_var.get())

        export_popup = ExportPopup(self, "Export as",
                                   "Export ATC-Tree as Excel (remember settings) or .tsv file")
        selection = export_popup.selection
        export_as_template = export_popup.export_as_template.get()

        if selection:
            self.set_status(f"Exporting ATC-tree to {selection} ..")
            export_fn = self.d.export_atc_tree(mode=selection, template=export_as_template)
            messagebox.showinfo("Export", f"Exported ATC-tree to: {export_fn}")

        self.set_status("")

    @exception_as_popup
    def load_file(self):
        """Prompt to load Excel/.tsv file

        If file ends on .xlsx: verify file and get tree type based on option in 'Settings'
            and number of columns in 'Tree' tabs, enable/disable and configure respective widgets
        """
        input_fn = filedialog.askopenfilename(initialdir=os.getcwd(),
                                              filetypes=[("Tree Table", ".xlsx .tsv"),
                                                         ("SQLite3 database", ".db .tar.gz"),
                                                         ("All files", "*")],
                                              title="Load MeSH/ATC-Tree from file")
        if not input_fn:
            return

        # rollback
        self.rollback_ui()
        self.atc_file_loaded = ""
        self.mesh_file_loaded = ""
        self.loaded_settings = {}
        obj = None

        if input_fn.endswith(".db") or input_fn.endswith(".tar.gz"):
            self.set_database(input_fn)
            return

        # verify file
        tree_type = self.p.verify_file(input_fn)

        # set core object settings, assign functions, set status
        self.set_status("")
        if tree_type.startswith("atc"):
            self.set_status("Loading ATC tree from file ..")
            self.build_atc_ui(db_functions=False)
            self.update()
            if tree_type == "atc_excel":
                self.d.load_atc_excel(fn=input_fn, read_settings=True, populate=False)
                self.atc_data_source_var.set("Excel file")
            elif tree_type == "atc_tsv":
                self.atc_data_source_var.set("TSV file")
            self.atc_asset_var.set(self.d.phenotype_name)
            obj = self.d
        elif tree_type.startswith("mesh"):
            self.set_status("Loading MeSH tree from file ..")
            self.build_mesh_ui(db_functions=False)
            self.update()
            if tree_type == "mesh_excel":
                self.p.load_mesh_excel(fn=input_fn, read_settings=True, populate=False)
                self.mesh_data_source_var.set("Excel file")
            elif tree_type == "mesh_tsv":
                self.mesh_data_source_var.set("TSV file")
            self.mesh_asset_var.set(self.p.drug_name)
            obj = self.p

        # disable all widgets to be enabled later
        self.toggle_widgets(enable=False, mode="db")

        # set general settings in GUI
        self.color_scale_var.set(str(obj.s["color_scale"]))
        create_tooltip(self.color_scale, self.color_scale_tt_template + self.color_scale_var.get())
        self.show_border_var.set(obj.s["show_border"])
        self.border_color.set(obj.s["border_color"])
        self.border_width.set(str(obj.s["border_width"]))
        create_tooltip(self.show_border, self.show_border_tt_template
                       + "\nCurrent properties: Color: " + self.border_color.get()
                       + ", Width: " + self.border_width.get())
        self.export_plot_var.set(obj.s["export_plot"])

        # set specific settings in GUI
        if tree_type.startswith("atc"):
            self.toggle_widgets(enable=True, mode="atc")
            self.atc_file_loaded = input_fn
            self.set_status(f"ATC tree loaded: {input_fn}")
            if tree_type == "atc_excel":
                self.atc_label_var.set(obj.s["atc_labels"])
                self.atc_wedge_width_var.set(obj.s["atc_wedge_width"])
        elif tree_type.startswith("mesh"):
            self.toggle_widgets(enable=True, mode="mesh")
            self.set_status(f"MeSH tree loaded: {input_fn}")
            self.mesh_file_loaded = input_fn
            if tree_type == "mesh_excel":
                self.mesh_drop_empty_var.set(obj.s["mesh_drop_empty_last_child"])
                self.mesh_label_var.set(obj.s["mesh_labels"])

        # store settings to check later if they have been modified if Excel was loaded
        if tree_type.endswith("_excel"):
            self.loaded_settings = {k: v for k, v in obj.s.items()}

        # reset button style
        self.load_file_btn.configure(style="big.TButton")


class ExportPopup(Toplevel):
    """Popup class with options to export data as Excel, TSV or Cancel"""
    def __init__(self, parent: App = None, title: str = None, message: str = None):
        """Export Popup init"""
        super().__init__(parent)
        self.title = title
        self.selection = None
        self.resizable(False, False)
        root = Frame(self)
        root.pack(padx=10, pady=10)

        # create widgets
        Label(root, text=message).pack()
        button_frame = Frame(root)
        button_frame.pack(fill="both", expand=True, pady=(20, 0))
        Button(button_frame, text="Cancel", command=partial(self.select, None)).pack(side="right")
        Button(button_frame, text="TSV", command=partial(self.select, "TSV")).pack(side="right")
        Button(button_frame, text="Excel", command=partial(self.select, "Excel")).pack(side="right")
        self.export_as_template = BooleanVar(value=False)
        check_button = Checkbutton(button_frame, text="Create Template",
                                   variable=self.export_as_template, onvalue=True, offvalue=False)
        check_button.pack(side="right")
        create_tooltip(check_button, "Creates an all-white template with 0 counts")

        # freeze mainloop
        self.wait_window(self)

    def select(self, export_mode: str):
        """Command for buttons 'TSV' and 'Excel'"""
        self.selection = export_mode
        self.destroy()
        return export_mode


class ColorScalePopup(Toplevel):
    """Popup to set the color scale"""
    def __init__(self, parent: App):
        """ColorScale Popup init"""
        super().__init__(parent)
        self.title = "Set Color Scale"
        self.resizable(False, False)
        self.parent = parent
        root = Frame(self)
        root.pack(padx=10, pady=10)

        # informative label
        Label(root, text="Enter values for an automatic color scale. The first color defines the "
                         "default color for empty nodes. Requires active propagation to have an "
                         "effect.", wraplength=230).pack(pady=(10, 10))

        # header for scale objects
        scale_header = Frame(root)
        scale_header.pack(fill="x", expand=True, pady=5)
        Label(scale_header, text="Threshold [%]").pack(side="left", anchor="w")
        Label(scale_header, text="Hex-Color").pack(side="right")

        # scale objects
        self.scale_frame = Frame(root)
        self.scale_frame.pack(fill="both", expand=True)

        current_scale = json.loads(self.parent.color_scale_var.get().replace("'", '"'))
        self.scale_frames = []
        for percentage, hex_color in current_scale:
            self.add_entry_pair(percentage, hex_color)

        # controller button bar, status
        controller_btn_frm = Frame(root)
        controller_btn_frm.pack(fill="x", expand=True)
        controller_btn_subfrm = Frame(controller_btn_frm)
        controller_btn_subfrm.pack(side="top")
        Button(controller_btn_subfrm, text="-", width=4, command=self.decrease).pack(side="left")
        Button(controller_btn_subfrm, text="+", width=4, command=self.increase).pack(side="left")
        self.status = Label(controller_btn_frm, text="", foreground="red")
        self.status.pack()

        # bottom button bar
        button_frm = Frame(root)
        button_frm.pack(fill="x", expand=True, pady=(20, 0))
        Button(button_frm, text="Cancel", command=lambda: self.destroy()).pack(side="right")
        Button(button_frm, text="Apply", command=self.set).pack(side="right")

        # freeze mainloop
        self.wait_window(self)

    def add_entry_pair(self, percentage: float, hex_color: str):
        """Subroutine to create an entry pair inside a frame and attach it to the list of
        scale frames"""
        frm = Frame(self.scale_frame)
        frm.pack()
        e_pct = Entry(frm, validate="focusout",
                      validatecommand=lambda: self.validate_percentage(e_pct))
        e_pct.pack(side="left")
        e_pct.insert(0, str(percentage * 100))
        e_hex = EntryOG(frm)
        e_hex.bind("<KeyRelease>", partial(self.validate_hex_color, e_hex))
        e_hex.pack(side="right")
        e_hex.insert(0, hex_color)
        e_hex.configure(foreground=hex_color)
        if hex_color == "#FFFFFF":
            e_hex.configure(background="#000000")
        self.scale_frames.append(frm)

    def rollback_percentage(self, e_pct: Entry, error: str, def_value: str = None) -> False:
        """Clears percentage entries"""
        e_pct.delete(0, END)
        if def_value:
            e_pct.insert(0, def_value)
        self.status.configure(text=error)
        return False

    def validate_percentage(self, e_pct: Entry) -> bool:
        """Validates percentage entries"""
        try:
            percentage = float(e_pct.get())
        except ValueError:
            return self.rollback_percentage(e_pct, "Percentage must be in range 0 - 100")

        if percentage < 0:
            return self.rollback_percentage(e_pct, "Percentage must be greater than 0",
                                            def_value="25")

        if percentage > 100:
            return self.rollback_percentage(e_pct, "Percentage must be less than 100",
                                            def_value="75")

        self.status.configure(text="")
        return False  # always validates

    def validate_hex_color(self, e_hex: EntryOG, _event: object = None) -> False:
        """Validates hex color"""
        color = e_hex.get()
        if not match("#[a-fA-F0-9]{6}$", color):
            # e_hex.delete(0, END)
            self.status.configure(text="Color code must match hex format")
            e_hex.configure(foreground="#000000", background="#FFFFFF")
            return False
        self.status.configure(text="")

        # calculate background based on threshold
        red, green, blue = hex_to_rgb(color)
        rgb_cutoff = (red*0.299 + green*0.587 + blue*0.114)
        e_hex.configure(foreground=color, background="#000000" if rgb_cutoff > 186 else "#FFFFFF")

        return False  # always validates

    def increase(self):
        """Adds a new entry pair at the end with default values (100%, black)"""
        self.add_entry_pair(1, "#000000")

    def decrease(self):
        """Removes an entry pair from the end if at least 2 pairs remain"""
        # only destroy as long as 2 pairs remain
        if len(self.scale_frames) > 2:
            self.scale_frames[-1].destroy()
            self.scale_frames = self.scale_frames[:-1]

        # set last percentage to 100 if pairs are reduced to 2
        if len(self.scale_frames) == 2:
            pct = self.scale_frames[-1].winfo_children()[0]
            pct.delete(0, END)
            pct.insert(0, "100")

    def set(self):
        """Validate all entries have values, reformat and set scale value, destroys popup"""
        last_child_percentage = 0
        percentage_dupe_check = []
        last_index = len(self.scale_frames)

        for sf_idx, scale_frame in enumerate(self.scale_frames):

            # validate all entries have values
            for idx, scaled_color in enumerate(scale_frame.winfo_children()):
                if scaled_color.get() == "":
                    self.status.configure(text="All entries require valid values")
                    return

                # validate percentages are increasing
                if idx == 0:
                    this_percentage = float(scaled_color.get())
                    if this_percentage < last_child_percentage:
                        self.status.configure(text="Threshold percentages must increase")
                        return

                    last_child_percentage = float(scaled_color.get())

                    # validate percentages are unique
                    if this_percentage in percentage_dupe_check:
                        self.status.configure(text="Threshold percentages must be unique")
                        return

                    percentage_dupe_check.append(this_percentage)

                    # validate first percentage is 0
                    if sf_idx == 0 and this_percentage != 0.0:
                        self.status.configure(text="First percentage must be 0")
                        return

                    # validate last percentage is 100
                    if sf_idx == last_index - 1 and this_percentage != 100.0:
                        self.status.configure(text="Last percentage must be 100")
                        return

        tmp_scale = []
        for scale_frame in self.scale_frames:
            pct, scaled_color = scale_frame.winfo_children()
            tmp_scale.append([float(pct.get())/100, scaled_color.get()])

        # set scale in parent, recreate tooltip
        self.parent.color_scale_var.set(json.dumps(tmp_scale))
        create_tooltip(self.parent.color_scale,
                       self.parent.color_scale_tt_template + self.parent.color_scale_var.get())

        # destroy popup
        self.destroy()


class BorderPopup(Toplevel):
    """Popup to define Border properties"""
    def __init__(self, parent: App):
        """Border Popup init"""
        super().__init__(parent)
        self.title = "Border Properties"
        self.parent = parent
        self.resizable(False, False)
        self.error = False
        root = Frame(self)
        root.pack(padx=10, pady=10)

        # informative label
        Label(root, text="Change or disable the current border properties.").pack(pady=(10, 10))

        # get parents colors
        red, green, blue, opacity = self.parent.border_color.get().\
            replace(" ", "").lstrip("rgba(").rstrip(")").split(",")

        # colors labelframe
        col_frm = LabelFrame(root, text="Colors")
        col_frm.pack(fill="x", expand=True, ipadx=2, ipady=2)
        rgb_frm = Frame(col_frm)
        rgb_frm.pack(side="left", ipadx=2, ipady=2)

        # red
        red_frm = Frame(rgb_frm)
        red_frm.pack(fill="x", expand=True, pady=(5, 2))
        Label(red_frm, text="Red").pack(side="left")
        self.red = Entry(red_frm)
        self.red.insert(0, red)
        self.red.pack(side="right")
        self.red.bind("<KeyRelease>", partial(self.validate_color, self.red))
        
        # green
        green_frm = Frame(rgb_frm)
        green_frm.pack(fill="x", expand=True, pady=2)
        Label(green_frm, text="Green").pack(side="left")
        self.green = Entry(green_frm)
        self.green.insert(0, green)
        self.green.pack(side="right")
        self.green.bind("<KeyRelease>", partial(self.validate_color, self.green))
        
        # blue
        blue_frm = Frame(rgb_frm)
        blue_frm.pack(fill="x", expand=True, pady=2)
        Label(blue_frm, text="Blue").pack(side="left")
        self.blue = Entry(blue_frm)
        self.blue.insert(0, blue)
        self.blue.pack(side="right")
        self.blue.bind("<KeyRelease>", partial(self.validate_color, self.blue))

        # rgb-hex
        hex_frm = LabelFrame(col_frm, text="Hex color")
        hex_frm.pack(side="right", ipadx=2, ipady=2, padx=(10, 4))
        self.hex = Entry(hex_frm, validate="focusout", validatecommand=self.validate_hex_color)
        self.hex.pack()
        self.preview = LabelOG(hex_frm, text="Preview")
        self.preview.pack()
        self.set_hex_from_rgb()

        # opacity
        opacity_width_frm = Frame(root)
        opacity_width_frm.pack()
        opacity_frm = Frame(opacity_width_frm)
        opacity_frm.pack(pady=(10, 2))
        Label(opacity_frm, text="Opacity [%]", width=12).pack(side="left", padx=(0, 10))
        self.opacity = Entry(opacity_frm, validate="focusout",
                             validatecommand=self.validate_opacity)
        self.opacity.insert(0, str(float(opacity)*100))
        self.opacity.pack(side="right")

        # width
        width_frm = Frame(opacity_width_frm)
        width_frm.pack(pady=2)
        Label(width_frm, text="Width [px]", width=12).pack(side="left", padx=(0, 10))
        self.width = Entry(width_frm, validate="focusout", validatecommand=self.validate_width)
        self.width.insert(0, self.parent.border_width.get())
        self.width.pack(side="right")

        self.status = Label(root, text="", foreground="red")
        self.status.pack(pady=(10, 0))

        # bottom button bar
        button_frm = Frame(root)
        button_frm.pack(fill="x", expand=True, pady=(20, 0))
        Button(button_frm, text="Cancel", command=lambda: self.destroy()).pack(side="right")
        Button(button_frm, text="Disable", command=self.disable).pack(side="right")
        Button(button_frm, text="Apply", command=self.set).pack(side="right")

        # freeze mainloop
        self.wait_window(self)

    def validate_hex_color(self) -> False:
        """Validates hex color"""
        if not match("#[a-fA-F0-9]{6}$", self.hex.get()):
            self.hex.delete(0, END)
            self.status.configure(text="Color code must match hex format")
            return False

        self.status.configure(text="")

        # set rgb from hex
        red, green, blue = hex_to_rgb(self.hex.get())
        self.red.delete(0, END)
        self.red.insert(0, str(red))
        self.green.delete(0, END)
        self.green.insert(0, str(green))
        self.blue.delete(0, END)
        self.blue.insert(0, str(blue))

        # update preview
        self.preview.configure(foreground=self.hex.get())

        return False

    def set_hex_from_rgb(self):
        """Writes hex color to entry if RGB is valid and all rgb values are within accepted range"""
        red, green, blue = self.red.get(), self.green.get(), self.blue.get()
        for color in [red, green, blue]:
            try:
                color = int(color)
                assert 0 <= color <= 255
            except (ValueError, AssertionError):
                self.error = True
                return

        self.hex.delete(0, END)
        self.hex.insert(0, rgb_to_hex((int(red), int(green), int(blue))))
        self.preview.configure(foreground=self.hex.get())

    def validate_color(self, wdg, _event) -> False:
        """Validates RGB color"""
        try:
            entry_value = wdg.get()
            color = int(entry_value)
            assert 0 <= color <= 255

            # remove preceding zeroes
            if entry_value[0] == "0" and len(entry_value) > 1:
                wdg.delete(0, END)
                wdg.insert(0, entry_value[1:])

        except (ValueError, AssertionError):
            wdg.delete(0, END)
            wdg.insert(0, "0")
            self.status.configure(text="Colors must be decimals in range 0-255")
            self.set_hex_from_rgb()
            return False

        self.status.configure(text="")
        self.set_hex_from_rgb()
        return False

    def validate_opacity(self) -> False:
        """Validates border opacity"""
        try:
            opacity = float(self.opacity.get())
            assert 0 <= opacity <= 100
        except (ValueError, AssertionError):
            self.status.configure(text="Opacity must be a float in range 0-100")
            self.error = True
            return False

        self.status.configure(text="")
        self.error = False
        return False

    def validate_width(self) -> False:
        """Validates border width"""
        try:
            width = float(self.width.get())
            assert width >= 0
        except (ValueError, AssertionError):
            self.status.configure(text="Width must be a float >= 0")
            self.error = True
            return False

        self.status.configure(text="")
        self.error = False
        return False

    def disable(self):
        """Popup kill event"""
        self.parent.show_border_var.set(False)
        create_tooltip(self.parent.show_border, self.parent.show_border_tt_template)
        self.destroy()

    def set(self):
        """Hand over variables to parent, keeps Popup alive if validation fails"""
        if self.status["text"] != "" or self.error:
            return

        border_color = str(f"rgba({self.red.get()},{self.green.get()},"
                           f"{self.blue.get()},{float(self.opacity.get())/100})")
        self.parent.border_color.set(border_color)
        self.parent.border_width.set(self.width.get())
        self.parent.show_border_var.set(True)
        create_tooltip(self.parent.show_border,
                       self.parent.show_border_tt_template + "\nCurrent properties: Color: "
                       + self.parent.border_color.get()
                       + ", Width: " + self.parent.border_width.get())
        self.destroy()


def run_app():
    print("Launching OntoViz Ontology Explorer GUI ..")
    app = App()
    app.mainloop()


if __name__ == "__main__":
    run_app()
