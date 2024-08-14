import json
from re import match
from functools import partial
from traceback import format_exc

from tkinter import Toplevel, messagebox, ttk, StringVar, BooleanVar, IntVar, END
from tkinter.ttk import LabelFrame, Frame
from tkinter import Label as LabelOG, Entry as EntryOG
from tkinter.colorchooser import askcolor

from src.ontoloviz.core import MeSHSunburst, ATCSunburst
from src.ontoloviz.core_utils import rgb_to_hex, hex_to_rgb


_key_release = "<KeyRelease>"


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
        self.tt_x = self.tt_y = 0

    def showtip(self, text: str = None, alt_text: str = None):
        """Calculate coordinates, create Toplevel, add Label with text to ToolTip"""
        if self.tip_window or not text:
            return

        # calculate coordinates
        tt_x, tt_y, _cx, _cy = self.widget.bbox("insert")
        tt_x = tt_x + self.widget.winfo_rootx() + 57
        tt_y = tt_y + _cy + self.widget.winfo_rooty() + 27

        # create Toplevel
        self.tip_window = tt_window = Toplevel(self.widget)
        tt_window.wm_overrideredirect(True)
        tt_window.wm_geometry(f"+{tt_x}+{tt_y}")

        # add Label with text
        tmp = text if str(self.widget['state']) != "disabled" else alt_text
        label = Label(tt_window, text=tmp, justify="left", relief="solid", borderwidth=0.5,
                      font=("Consolas", 8))
        label.pack(ipadx=1)

    def hidetip(self):
        """Destroy Toplevel of ToolTip"""
        tt_window = self.tip_window
        self.tip_window = None
        if tt_window:
            tt_window.destroy()


def create_tooltip(widget: [Label, Checkbutton, Combobox, Entry, Button, Radiobutton] = None,
                   text: str = None):
    """Create tooltip for any widget.
    Example: create_tooltip(some_widget, text="Test Message")

    :param widget: widget to attach tooltip to
    :param text: Text to display on active widget
    """
    if not widget:
        return
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
            tt_text = str(" {}".format(" \n ".join(text.split("\n")))
                          if text.find("\n") != -1 else f" {text} ")
            tt_alt_text = str(" {}".format(" \n ".join(alt_text.split("\n")))
                              if alt_text.find("\n") != -1 else f" {alt_text} ")
            tool_tip.showtip(tt_text, tt_alt_text)
        except Exception as exc:
            print(exc)

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
        except Exception as exc:
            _args = " ".join([str(_) for _ in exc.args])
            messagebox.showerror(f"Error: {_args}", f"{_args}\n\n{'*' * 30}\n\n{format_exc()}")
    return wrapper


class ExportPopup(Toplevel):
    """Popup class with options to export data as Excel, TSV or Cancel"""
    def __init__(self, parent: [MeSHSunburst, ATCSunburst] = None, title: str = None, message: str = None):
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
    def __init__(self, parent: [MeSHSunburst, ATCSunburst]):
        """ColorScale Popup init"""
        super().__init__(parent)
        self.title("Set Color Scale")
        self.black = "#000000"
        self.white = "#FFFFFF"
        self.resizable(False, False)
        self.parent = parent
        root = Frame(self)
        root.pack(padx=10, pady=10)

        # informative label
        Label(root,
              text="Enter values for an automatic color scale. The first color defines the default "
                   "color for empty nodes. Requires active propagation to have an "
                   "effect. Thresholds must increase and be in range from 0-100.",
              wraplength=400).pack(pady=(10, 10))

        # header for scale objects
        scale_header = Frame(root)
        scale_header.pack(fill="x", expand=True, pady=5, padx=(33, 175))
        Label(scale_header, text="Threshold [%]").pack(side="left", anchor="w")
        Label(scale_header, text="Hex-Color").pack(side="right")

        # scale objects
        self.scale_frame = Frame(root)
        self.scale_frame.pack(fill="both", expand=True)

        current_scale = json.loads(self.parent.color_scale_var.get().replace("'", '"'))
        self.thresholds = []
        for percentage, hex_color in current_scale:
            self.add_threshold(percentage, hex_color)

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

    def add_threshold(self, percentage: float, hex_color: str) -> None:
        """Subroutine to create an entry pair inside a frame and attach it to the list of
        scale frames"""
        frm = Frame(self.scale_frame)
        frm.pack()
        e_pct = Entry(frm, validate="focusout",
                      validatecommand=lambda: self.validate_percentage(e_pct))
        e_pct.pack(side="left")
        e_pct.insert(0, str(percentage * 100))
        e_hex = EntryOG(frm)
        e_hex.bind(_key_release, partial(self.validate_hex_color, e_hex))
        e_hex.insert(0, hex_color)
        e_hex.configure(foreground=hex_color)
        btn_color_picker = Button(frm, text="Pick Color",
                                  command=lambda: self.color_picker_wrapper(e_hex))
        btn_color_picker.pack(side="right")
        e_hex.pack(side="right")

        if hex_color == "#FFFFFF":
            e_hex.configure(background=self.black)
        self.thresholds.append(frm)

    def color_picker_wrapper(self, e_hex: EntryOG) -> None:
        """Launches color picker and inserts into entry"""
        current_color = e_hex.get()
        new_color = askcolor(color=current_color)
        hex_code = new_color[1]
        if hex_code and isinstance(hex_code, str):
            e_hex.delete(0, END)
            e_hex.insert(0, hex_code.upper())
            self.validate_hex_color(e_hex)

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
            e_hex.configure(foreground=self.black, background=self.white)
        else:
            self.status.configure(text="")
    
            # calculate background based on threshold
            red, green, blue = hex_to_rgb(color)
            rgb_cutoff = (red*0.299 + green*0.587 + blue*0.114)
            e_hex.configure(foreground=color,
                            background=self.black if rgb_cutoff > 186 else self.white)

        return False  # always validates

    def increase(self):
        """Adds a new entry pair at the end with default values (100%, black)"""
        self.add_threshold(1, self.black)

    def decrease(self):
        """Removes an entry pair from the end if at least 2 pairs remain"""
        # only destroy as long as 2 pairs remain
        if len(self.thresholds) > 2:
            self.thresholds[-1].destroy()
            self.thresholds = self.thresholds[:-1]

        # set last percentage to 100 if pairs are reduced to 2
        if len(self.thresholds) == 2:
            pct = self.thresholds[-1].winfo_children()[0]
            pct.delete(0, END)
            pct.insert(0, "100")

    def set(self):
        """Validate all entries have values, reformat and set scale value, destroys popup"""
        last_child_percentage = 0
        percentage_dupe_check = []
        last_index = len(self.thresholds)

        for sf_idx, scale_frame in enumerate(self.thresholds):

            # validate all entries have values
            for idx, widget in enumerate(scale_frame.winfo_children()):
                if isinstance(widget, Entry) and widget.get() == "":
                    self.status.configure(text="All entries require valid values")
                    return

                # validate percentages are increasing
                if idx == 0:
                    this_percentage = float(widget.get())
                    if this_percentage < last_child_percentage:
                        self.status.configure(text="Threshold percentages must increase")
                        return

                    last_child_percentage = float(widget.get())

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
        for scale_frame in self.thresholds:
            pct, hex_entry, _ = scale_frame.winfo_children()
            tmp_scale.append([float(pct.get())/100, hex_entry.get()])

        # set scale in parent, recreate tooltip
        self.parent.color_scale_var.set(json.dumps(tmp_scale))
        create_tooltip(self.parent.color_scale,
                       self.parent.color_scale_tt_template + self.parent.color_scale_var.get())

        # destroy popup
        self.destroy()


class BorderPopup(Toplevel):
    """Popup to define Border properties"""
    def __init__(self, parent: [MeSHSunburst, ATCSunburst]):
        """Border Popup init"""
        super().__init__(parent)
        self.title("Set Border Properties")
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
        self.hex_color = rgb_to_hex((int(red), int(green), int(blue)))

        # colors labelframe
        col_frm = LabelFrame(root, text="Color")
        col_frm.pack(fill="x", expand=True, ipadx=2, ipady=2)
        btn_frm = Frame(col_frm)
        btn_frm.pack()
        rgb_frm = Frame(col_frm)
        rgb_frm.pack(side="left", ipadx=2, ipady=2)

        pick_color_button = Button(btn_frm, text="Pick Color", command=self.color_picker_wrapper)
        pick_color_button.pack()

        # red
        red_frm = Frame(rgb_frm)
        red_frm.pack(fill="x", expand=True, pady=(5, 2))
        Label(red_frm, text="Red").pack(side="left")
        self.red = Entry(red_frm)
        self.red.insert(0, red)
        self.red.pack(side="right")
        self.red.bind(_key_release, partial(self.validate_color, self.red))

        # green
        green_frm = Frame(rgb_frm)
        green_frm.pack(fill="x", expand=True, pady=2)
        Label(green_frm, text="Green").pack(side="left")
        self.green = Entry(green_frm)
        self.green.insert(0, green)
        self.green.pack(side="right")
        self.green.bind(_key_release, partial(self.validate_color, self.green))

        # blue
        blue_frm = Frame(rgb_frm)
        blue_frm.pack(fill="x", expand=True, pady=2)
        Label(blue_frm, text="Blue").pack(side="left")
        self.blue = Entry(blue_frm)
        self.blue.insert(0, blue)
        self.blue.pack(side="right")
        self.blue.bind(_key_release, partial(self.validate_color, self.blue))

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
        self.opacity_var = IntVar()
        opacity_scale = ttk.LabeledScale(opacity_frm, variable=self.opacity_var, from_=0, to=100)
        opacity_scale.scale.set(int(float(opacity)*100))
        opacity_scale.pack(side="right")

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
        Button(button_frm, text="Disable Border", command=self.disable).pack(side="right")
        Button(button_frm, text="Apply", command=self.set).pack(side="right")

        # freeze mainloop
        self.wait_window(self)

    def color_picker_wrapper(self) -> None:
        """Launches color picker, inserts into hex entry, triggers validation"""
        rgb, hex_color = askcolor(color=self.hex_color)
        if rgb and hex_color:
            hex_color = hex_color.upper()
            self.hex.delete(0, END)
            self.hex.insert(0, hex_color)
            self.validate_hex_color()

    def validate_hex_color(self) -> False:
        """Validates hex color"""
        if not match("#[a-fA-F0-9]{6}$", self.hex.get()):
            self.hex.delete(0, END)
            self.status.configure(text="Color code must match hex format")
        else:
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
            
            self.status.configure(text="")
            self.set_hex_from_rgb()
        except (ValueError, AssertionError):
            wdg.delete(0, END)
            wdg.insert(0, "0")
            self.status.configure(text="Colors must be decimals in range 0-255")
            self.set_hex_from_rgb()
        
        return False

    def validate_width(self) -> False:
        """Validates border width"""
        try:
            width = float(self.width.get())
            assert width >= 0
            self.status.configure(text="")
            self.error = False
        except (ValueError, AssertionError):
            self.status.configure(text="Width must be a float >= 0")
            self.error = True

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
                           f"{self.blue.get()},{float(self.opacity_var.get())/100})")
        self.parent.border_color.set(border_color)
        self.parent.border_width.set(self.width.get())
        self.parent.show_border_var.set(True)
        create_tooltip(self.parent.show_border,
                       self.parent.show_border_tt_template + "\nCurrent properties: Color: "
                       + self.parent.border_color.get()
                       + ", Width: " + self.parent.border_width.get())
        self.destroy()


class SelectOptionsPopup(Toplevel):
    """Popup to define the type of the ontology in case automatic parsing was not successful"""
    def __init__(self, parent: [MeSHSunburst, ATCSunburst] = None, title: str = None,
                 info_text: str = None, options: dict = None, is_ontology_popup: bool = False):
        super().__init__(parent)
        self.title(title)
        self.parent = parent
        self.resizable(False, False)
        self.result = None
        self.description = None
        self.is_ontology_popup = is_ontology_popup
        self.separator = None

        # custom .obo definitions
        self.custom_url = None
        self.min_node_size = None
        self.root_id = None
        self.url_error = "Enter URL to .obo file!"

        lbl_frame = Frame(self)
        lbl_frame.pack()
        descriptive_label = ttk.Label(lbl_frame, wraplength=400, text=info_text)
        descriptive_label.pack(pady=10, padx=10)

        self.radio_var = StringVar()

        self.options = options
        rb_frame = Frame(self)
        rb_frame.pack()
        for ontology_id, texts in self.options.items():
            title, tooltip = texts
            rb = Radiobutton(rb_frame, text=title, variable=self.radio_var, value=ontology_id)
            rb.pack(anchor="w")
            if tooltip:
                create_tooltip(rb, tooltip)

        sep_frame = Frame(self)
        sep_frame.pack(pady=(10, 0))
        self.sep_var = BooleanVar()
        self.sep_check = Checkbutton(sep_frame, text="Float-Counts", variable=self.sep_var, command=self.sep_controller)
        self.sep_check.pack(side="left")
        create_tooltip(self.sep_check, "Check if your counts are positive floating point values")
        self.sep_entry = Entry(sep_frame, state="disabled")
        self.sep_entry.pack(side="left")
        create_tooltip(self.sep_entry, "Enter floating point separator (. or ,)")

        self.status = Label(self, text="")
        self.status.pack()

        if self.is_ontology_popup:
            self.radio_var.trace_add("write", self.radio_var_callback)
            self.cpane = CollapsiblePane(self)
            self.cpane.pack()
            Label(self.cpane.frame, text="URL:").grid(column=0, row=0, sticky="E", padx=(0, 2))
            self.url_entry = Entry(self.cpane.frame)
            self.url_entry.grid(column=1, row=0, sticky="W")
            create_tooltip(self.url_entry, "Enter URL to .obo file, "
                                           "e.g.: https://purl.obolibrary.org/obo/po.obo"
                                           "\nCheck https://obofoundry.org/ for ontologies")
            Label(self.cpane.frame, text="Root ID:").grid(column=0, row=1, sticky="E", padx=(0, 2))
            self.root_id_entry = Entry(self.cpane.frame)
            self.root_id_entry.grid(column=1, row=1, sticky="W")
            create_tooltip(self.root_id_entry,
                           "Optional: Enter the root ID to start building a tree structure.\n"
                           "All the children of the specified ID will be used as sub-trees.\n"
                           "If the root ID field is left empty, the sub-trees will be\n"
                           "constructed based on nodes that do not have an 'is_a' relationship.")
            Label(self.cpane.frame, text="Min. Node Size:").grid(column=0, row=2, sticky="E",
                                                                 padx=(0, 2))
            self.min_node_size_entry = Entry(self.cpane.frame)
            self.min_node_size_entry.grid(column=1, row=2, sticky="W")
            create_tooltip(self.min_node_size_entry, "Optional: Enter the minimum amount of nodes "
                                                     "for a sub-tree to be included in the "
                                                     "visualization")

        btn_frame = Frame(self)
        btn_frame.pack(pady=10)

        ok_button = Button(btn_frame, text="OK", command=self.on_ok)
        ok_button.pack(side="left")

        cancel_button = Button(btn_frame, text="Cancel", command=self.on_cancel)
        cancel_button.pack(side="left")

        # freeze mainloop
        self.wait_window(self)

    def sep_controller(self):
        if self.sep_var.get():
            self.sep_entry.config(state="normal")
        else:
            self.sep_entry.config(state="disabled")
            self.sep_entry.delete(0, "end")

    def radio_var_callback(self, *args):
        if self.radio_var.get() == "custom_url":
            self.cpane.show()
        else:
            self.cpane.hide()

    def on_ok(self):
        self.status.config(text="")
        if not self.verify_result() or not self.verify_ontology_params() or not self.verify_separator_params():
            return False

        self.destroy()

    def verify_result(self):
        if not self.radio_var.get():
            self.status.config(text="Select an ontology type!")
            return False
        self.result = self.radio_var.get()
        self.description = self.options[self.result][0]
        return True

    def verify_ontology_params(self) -> bool:
        if self.radio_var.get() == "custom_url" and self.is_ontology_popup:
            url_entry = self.url_entry.get()
            min_node_size = self.min_node_size_entry.get()
            root_id = self.root_id_entry.get()

            # check URL is entered
            if not url_entry or url_entry == self.url_error or not url_entry.endswith(".obo"):
                self.url_entry.delete(0, END)
                self.url_entry.insert(0, self.url_error)
                return False

            self.custom_url = url_entry

            # ensure min_node_size is an int
            if min_node_size:
                try:
                    self.min_node_size = int(min_node_size)
                except ValueError:
                    self.min_node_size_entry.delete(0, END)
                    self.min_node_size_entry.insert(0, "Must be an integer!")
                    return False

            if root_id:
                self.root_id = root_id
        return True

    def verify_separator_params(self):
        if self.sep_var.get():
            if self.sep_entry.get() not in [",", "."]:
                self.sep_entry.delete(0, "end")
                self.status.config(text="Float separator must be defined (point . or comma ,)")
                return False

            self.separator = self.sep_entry.get() if self.sep_entry.get() else None
        return True

    def on_cancel(self):
        self.destroy()


class CollapsiblePane(ttk.Frame):
    """
     -----USAGE-----
    collapsiblePane = CollapsiblePane(parent,
                          expanded_text =[string],
                          collapsed_text =[string])

    collapsiblePane.pack()
    button = Button(collapsiblePane.frame).pack()
    """

    def __init__(self, parent):

        ttk.Frame.__init__(self, parent)
        self.parent = parent

        # Here weight implies that it can grow its size if extra space is available
        self.columnconfigure(1, weight=1)

        # dummy label, required for resizing to work properly
        self._dummy = Label(self)
        self._dummy.grid(row=0, column=0)

        self.frame = ttk.Frame(self)

    def show(self):
        self.frame.grid(row=1, column=0, columnspan=2)

    def hide(self):
        self.frame.grid_forget()
