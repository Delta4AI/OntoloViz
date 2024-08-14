import os
import tarfile
import json
from functools import partial
from threading import Thread
import time
import textwrap

from tkinter import Tk, StringVar, BooleanVar, IntVar, filedialog, messagebox, END
from tkinter.ttk import LabelFrame, Frame, Style

from src.ontoloviz.core import MeSHSunburst, ATCSunburst
from src.ontoloviz.obo_utils import get_remote_ontology, build_non_separator_based_tree
from src.ontoloviz.app_utils import Button, Entry, Combobox, Checkbutton, Label, Radiobutton
from src.ontoloviz.app_utils import create_tooltip, exception_as_popup
from src.ontoloviz.app_utils import ExportPopup, ColorScalePopup, BorderPopup, SelectOptionsPopup


class App(Tk):
    """OntoloViz App class"""
    def __init__(self):
        """App Initialization, styles, memory variables"""
        super().__init__()
        self.title("OntoloViz")
        self.resizable(True, True)
        self.minsize(400, 80)

        # highres settings for screenshot
        # import ctypes
        # ctypes.windll.shcore.SetProcessDpiAwareness(1)
        # self.tk.call("tk", "scaling", 2)

        # style definitions
        self.d4_red = "#C33D35"
        self.d4_purple = "#403C53"
        self.d4_custom = "#8CA6D9"
        self.d4_green = "#579D66"
        self.d4_white = "#FFFFFF"
        self.d4_black = "#000000"
        dark_bg = "#2E2D32"
        success = "#6BBE92"
        self.bold_normal = ("Arial", 8, "bold")
        self.bold_large = ("Arial", 9, "bold")
        self.configure(background=dark_bg)
        self.style = Style()
        self.style.configure("success.TButton", font=self.bold_large, background=success)
        self.style.configure("dark.TButton", font=self.bold_normal, background=dark_bg)
        self.style.configure("dark.TFrame", background=dark_bg)
        self.style.configure("dark.TLabelframe", font=self.bold_large, background=dark_bg,
                             relief="ridge")
        self.style.configure("dark.TLabelframe.Label", background=dark_bg, foreground=self.d4_white)
        self.style.configure("dark.TLabel", background=dark_bg, foreground=self.d4_white)
        self.change_theme_color(foreground=self.d4_white, background=self.d4_red)

        # core variables
        self.p = MeSHSunburst()
        self.d = ATCSunburst()
        self.obo = None

        # memory variables (settings)
        self.database_var = StringVar()
        self.color_scale_var = StringVar(
            value=f'[[0, "{self.d4_white}"], [0.2, "{self.d4_purple}"], [1, "{self.d4_red}"]]')
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
        self.mesh_legend_enabled_control = BooleanVar(value=True)
        self.mesh_legend_enable = None  # Checkbutton
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
        self.mesh_summary_plot_var = IntVar(value=5)  # stores values from entry
        self.mesh_summary_plot_control = BooleanVar(value=True)  # controls enabling of entry
        self.mesh_summary_plot = None  # checkbox widget
        self.mesh_summary_plot_cols = None  # entry widget
        self.mesh_summary_plot_lbl = None  # label 'Columns: '
        self.mesh_plot_type_var = StringVar(value="Sunburst Plot")
        self.mesh_plot_type = None  # Combobox
        self.atc_data_sources = ["Linked Tuple"]
        self.atc_data_source_var = StringVar(value=self.atc_data_sources[0])
        self.atc_legend_enabled_control = BooleanVar(value=True)
        self.atc_legend_enable = None  # Checkbutton
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
        self.atc_summary_plot_var = IntVar(value=5)
        self.atc_summary_plot_control = BooleanVar(value=True)
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
        self.color_scale_btn_mesh = None
        self.color_scale_btn_atc = None
        self.color_scale_tt_template = None
        self.show_border = None
        self.show_border_btn_mesh = None
        self.show_border_btn_atc = None
        self.show_border_tt_template = None
        self.load_file_btn = None
        self.load_obo_url_btn = None
        self.atc_file_loaded = ""
        self.mesh_file_loaded = ""
        self.performance_warning_shown = False
        self.custom_ontology_separator = None

        # various templates
        self.alt_text_db = "This functionality requires a valid database"
        self.alt_text = "This functionality requires a valid database or a loaded file"
        self.color_scale_tt_template = str("Define a custom color scale for the sunburst.\n"
                                           "Requires active propagation, overwrites colors defined "
                                           "in file. \nCurrent scale: ")
        self.show_border_tt_template = "Configure the border drawn around the sunburst wedges"
        self.save_plot_tt_template = str("Save the generated plot as interactive .html file and "
                                         "creates a .tsv template for usage with own data based "
                                         "on current settings")
        self.plot_tt_template = "Generate plot and open interactive sunburst in browser"
        self.export_tt_template = str("Generate sunburst data without plotting, export to "
                                      "Excel/TSV for later use/customization")
        self.propagate_color_tt = str(
            "off: Color scale is based on 'Color' column from imported file\n"
            "specific: Color scale is based on the maximum values of the corresponding tree\n"
            "global: Color scale is based on the maximum values of the entire ontology"
            "ALT:Enable 'Propagation' to modify propagation color specificity"
        )
        self.propagate_color_mesh_tt = str(
            "off: Color scale is based on 'Color' column from imported file\n"
            "specific: Color scale is based on the max values of the corresponding tree\n"
            "global: Color scale is based on the max values of the entire ontology\n"
            "phenotype: Only the most outer node in a branch is colored"
            "ALT:Enable 'Propagation' to modify propagation color specificity"
        )
        self.propagate_counts_tt = str(
            "off: no counts are propagated, counts equal imported values\n"
            "level: counts are propagated up to defined level, values above threshold remain "
            "unchanged\n"
            "all: counts are propagated up to central node, imported values are corrected "
            "and overwritten\n"
            "ALT: Enable 'Propagation' to modify propagation counts"
        )
        self.hpo_ontology_tt = str(
            "Fetches the Human Phenotype Ontology (sub-tree 'Phenotypic "
            "abnormality') from https://purl.obolibrary.org/obo/hp.obo\n---\n"
            "The Human Phenotype Ontology (HPO) aims to provide a standardized "
            "vocabulary of phenotypic abnormalities encountered in human disease."
            "\nEach term in the HPO describes a phenotypic abnormality, such as "
            "atrial septal defect.\nThe HPO is currently being developed using the"
            " medical literature, Orphanet, DECIPHER, and OMIM."
            "\n---\nFor more information visit: https://hpo.jax.org/app"
        )
        self.gene_ontology_tt = str(
            "(sub-trees with < 2 nodes excluded) from "
            "https://current.geneontology.org/ontology/go.obo\n---\n"
            "The goal of the GeneOntology (GO) project is to provide a uniform "
            "way to describe the functions of gene products\nfrom organisms "
            "across all kingdoms of life and thereby enable analysis of genomic "
            "data\n---\nFor more information visit: http://geneontology.org/"
        )
        self.po_ontology_tt = str(
            "Fetches the Plant Ontology (sub-tree 'plant structure') "
            "(sub-trees with < 5 nodes excluded) "
            "from https://purl.obolibrary.org/obo/po.obo\n---\n"
            "The Plant Ontology is a structured vocabulary and database resource that links plant "
            "anatomy, morphology and growth and development to plant genomics data.\nThe PO is "
            "under active development to expand to encompass terms and annotations from all plants."
            "\n---\nFor more information visit: http://planteome.org/"
        )
        self.cl_ontology_tt = str(
            "Fetches the Cell Ontology (without inter-ontology axioms) "
            "(sub-trees with < 2 nodes excluded) "
            "from http://purl.obolibrary.org/obo/cl/cl-basic.obo\n---\n"
            "The Cell Ontology is designed as a structured controlled vocabulary for cell types.\n"
            "This ontology was constructed for use by the model organism and other bioinformatics "
            "databases, where there is a need for a controlled vocabulary of cell types.\nThis "
            "ontology is not organism specific. It covers cell types from prokaryotes to mammals.\n"
            "However, it excludes plant cell types, which are covered by PO."
            "\n---\nFor more information visit: https://biccn.org/"
        )
        self.chebi_ontology_tt = str(
            "Fetches the Chemical Entities of Biological Interest (CHEBI) Ontology (sub-tree "
            "'molecular entity') from https://purl.obolibrary.org/obo/chebi/chebi_lite.obo\n---\n"
            "A freely available dictionary of molecular entities focused on ‘small’ chemical "
            "compounds.\nThe term ‘molecular entity’ refers to any constitutionally or isotopically"
            " distinct atom, molecule, ion, ion pair, radical, radical ion, complex, conformer, "
            "etc., identifiable as a separately distinguishable entity.\nThe molecular entities in "
            "question are either products of nature or synthetic products used to intervene in the "
            "processes of living organisms."
            "\n---\nFor more information visit: https://www.ebi.ac.uk/chebi/"
        )
        self.uberon_ontology_tt = str(
            "Fetches the Uberon multi-species anatomy ontology (sub-tree 'anatomical structure') "
            "(sub-trees with < 2 nodes excluded) from "
            "https://purl.obolibrary.org/obo/uberon/basic.obo\n---\n"
            "Uberon is an integrated cross-species ontology covering anatomical structures in "
            "animals.\n---\nFor more information visit: https://obophenotype.github.io/uberon/"
        )
        self.doid_ontology_tt = str(
            "Fetches the Human Disease Ontology from https://purl.obolibrary.org/obo/doid.obo"
            "\n---\nThe Disease Ontology has been developed as a standardized ontology for human "
            "disease with the purpose of providing the biomedical community with consistent, \n"
            "reusable and sustainable descriptions of human disease terms, phenotype "
            "characteristics and related medical vocabulary disease concepts through "
            "collaborative efforts with biomedical researchers, \ncoordinated by the University "
            "of Maryland School of Medicine, Institute for Genome Sciences.\nThe Disease Ontology "
            "semantically integrates disease and medical vocabularies through extensive cross "
            "mapping of DO terms to MeSH, ICD, NCI’s thesaurus, SNOMED and OMIM."
            "\n---\nFor more information visit: https://www.disease-ontology.org/"
        )

        # function calls
        self.build_base_ui()
        self.toggle_widgets(enable=False, mode="db")

    def change_theme_color(self, foreground: str = None, background: str = None) -> None:
        self.style.configure("primary.TLabelframe", background=background, relief="ridge")
        self.style.configure("primary.TLabelframe.Label", font=self.bold_large,
                             background=background, foreground=foreground)
        self.style.configure("primary_sub.TLabelframe", background=background)
        self.style.configure("primary_sub.TLabelframe.Label", background=background,
                             foreground=foreground, font=self.bold_normal)
        self.style.configure("primary.TFrame", background=background)
        self.style.configure("primary.TLabel", background=background, foreground=foreground)
        self.style.configure("primary.TButton", font=self.bold_normal, background=background)
        self.style.configure("primary.TCheckbutton", background=background,
                             activebackground=background, foreground=foreground)
        self.style.configure("primary.TRadiobutton", background=background,
                             activebackground=background)

    def build_base_ui(self):
        """Builds the base graphical UI elements to load a file"""

        # ######################################### LOAD FRAME AT TOP ############################ #

        load_frm = Frame(self, style="dark.TFrame")
        load_frm.pack(ipadx=2, ipady=2, fill="both", expand=True)

        self.load_file_btn = Button(load_frm, text="Load File", command=self.load_file,
                                    style="success.TButton")
        self.load_file_btn.pack(side="left", padx=(4, 2), pady=(2, 0))
        create_tooltip(self.load_file_btn,
                       "Load an Excel or .tsv file with ontology-based data."
                       "\n ---"
                       "\n - ATC/MeSH ontologies are automatically recognized if "
                       "given templates are used"
                       "\n - For other ontologies, the separator has to be defined after "
                       "loading the file (possible separators: . , _ /)"
                       "\n ---"
                       "\n - Minimal Example for separator-based ontologies "
                       "(requires 5 columns and header):"
                       "\n - parents are automatically created if not defined"
                       "\n   -------------------------------------------------------"
                       "\n   ID              | Label   | Description | Count | Color"
                       "\n   --              | -----   | ----------- | ----- | -----"
                       "\n   A               | group 1 |             |       |"
                       "\n   A_1             | child 1 |             |       |"
                       "\n   B_1_2_3|C_1_2_3 | child 2 |             |       |"
                       "\n   -------------------------------------------------------"
                       "\n - Minimal Example for non-structured ontologies "
                       "(requires 6 columns and header):"
                       "\n - nodes without valid parent IDs are removed"
                       "\n   ----------------------------------------------------------------"
                       "\n   ID              | Parent | Label   | Description | Count | Color"
                       "\n   --              | ------ | -----   | ----------- | ----- | -----"
                       "\n   HP:00A          |        | group 1 |             |       |"
                       "\n   HP:001          | HP:00A | child 1 |             |       |"
                       "\n   HP:002          | HP:00A | child 2 |             |       |"
                       "\n   ----------------------------------------------------------------"
                       "\n ---"
                       "\n - ATC: counts for non-drug levels (1-4) will be recalculated and "
                       "overwritten if a parents value does not match all child values."
                       "\n - ATC: custom colors are not applied when propagation is active"
                       "\n ---"
                       "\n - Excel files remember settings, .tsv files always load defaults"
                       "\n - For more information, read: https://github.com/Delta4AI/OntoloViz")

        self.load_obo_url_btn = Button(load_frm, text="Load from Web", command=self.load_url,
                                       style="success.TButton")
        self.load_obo_url_btn.pack(side="left", padx=2, pady=(2, 0))
        create_tooltip(self.load_obo_url_btn, "Download and visualize .obo ontologies from a "
                                              "predefined list or specify a custom URL")

        # ####################################### MESH/DRUG FRAMES ############################### #

        self.mesh_frame = Frame(self, style="dark.TFrame")
        self.mesh_frame.pack(fill="both")
        self.atc_frame = Frame(self, style="dark.TFrame")
        self.atc_frame.pack(fill="both")

        # ###################################### STATUS AT BOTTOM ################################ #

        self.status_frame = LabelFrame(self, text="Status", style="dark.TLabelframe")
        self.status_frame.pack(ipadx=2, ipady=2, fill="both")
        status = Label(self.status_frame, textvariable=self.status_var, style="dark.TLabel")
        status.pack(side="right", padx=2)

    def build_mesh_ui(self, db_functions: bool = None):
        """Builds MeSH-phenotype specific controls if proper file was loaded

        :param db_functions: if True, database related widgets are generated
        """
        # ###################################### PHENOTYPE/MESH SUNBURST ######################### #

        # top frame
        p_frm = LabelFrame(self.mesh_frame, text="Display Settings", style="primary.TLabelframe")
        p_frm.pack(ipadx=2, ipady=2, fill="both")

        if db_functions:
            # query data frame
            mesh_data_frm = LabelFrame(p_frm, text="Query Data", style="primary_sub.TLabelframe")
            mesh_data_frm.pack(ipadx=2, ipady=2, padx=4, pady=2, anchor="w")

            # asset subframe
            mesh_asset_frm = Frame(mesh_data_frm, style="primary.TFrame")
            mesh_asset_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")
            mesh_asset_label = Label(mesh_asset_frm, text="Asset name:", style="primary.TLabel",
                                     db_w=True, width=12)
            mesh_asset_label.pack(side="left", padx=2)
            mesh_asset = Entry(mesh_asset_frm, db_w=True, textvariable=self.mesh_asset_var,
                               width=40)
            mesh_asset.pack(side="left", padx=(2, 10))
            create_tooltip(mesh_asset, "Enter drug name name (e.g. ASPIRIN, case sensitive)")

            # data source subframe
            mesh_data_source_frm = Frame(mesh_data_frm, style="primary.TFrame")
            mesh_data_source_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")
            mesh_data_source_label = Label(mesh_data_source_frm, text="Data source:",
                                           style="primary.TLabel", db_w=True, width=12)
            mesh_data_source_label.pack(side="left", padx=2)
            mesh_data_source = Combobox(mesh_data_source_frm,
                                        textvariable=self.mesh_data_source_var,
                                        values=self.mesh_data_sources, state="readonly", db_w=True,
                                        width=max([len(_) for _ in self.mesh_data_sources]))
            mesh_data_source.pack(side="left", padx=2, fill="x", expand=True)
            create_tooltip(mesh_data_source, "Select data source")

        # frame for options
        p_options_frm = Frame(p_frm, style="primary.TFrame")
        p_options_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")

        # general options subframe
        mesh_display_options_frm = LabelFrame(p_options_frm, text="General",
                                              style="primary_sub.TLabelframe")
        mesh_display_options_frm.pack(fill="both")

        # colors subframe
        mesh_display_options_top_frm = Frame(mesh_display_options_frm, style="primary.TFrame")
        mesh_display_options_top_frm.pack(fill="both", pady=2)

        # set color scale button
        self.color_scale_btn_mesh = Button(mesh_display_options_top_frm, text="Set Color Scale",
                                           style="primary.TButton", db_w=True, mesh_w=True,
                                           command=lambda: ColorScalePopup(self))
        self.color_scale_btn_mesh.pack(side="left", padx=2)
        create_tooltip(self.color_scale_btn_mesh,
                       self.color_scale_tt_template + self.color_scale_var.get())

        # set border button
        self.show_border_btn_mesh = Button(mesh_display_options_top_frm, text="Set Border",
                                           style="primary.TButton", db_w=True, mesh_w=True,
                                           command=lambda: BorderPopup(self))
        self.show_border_btn_mesh.pack(side="left", padx=2)
        create_tooltip(self.show_border_btn_mesh, self.show_border_tt_template
                       + "\nCurrent properties: Color: " + self.border_color.get()
                       + ", Width: " + self.border_width.get())

        # display legend checkmark
        self.mesh_legend_enable = Checkbutton(mesh_display_options_top_frm, text="Legend",
                                              style="primary.TCheckbutton", db_w=True,
                                              mesh_w=True, onvalue=True, offvalue=False,
                                              variable=self.mesh_legend_enabled_control)
        self.mesh_legend_enable.pack(side="right", padx=2)
        create_tooltip(self.mesh_legend_enable,
                       "Displays a legend in form of a weighted color bar. "
                       "Disabled for summary plots with specific color propagation enabled.")

        mesh_display_options_bottom_frm = Frame(mesh_display_options_frm, style="primary.TFrame")
        mesh_display_options_bottom_frm.pack(fill="both", pady=(0, 2))

        # drop empty last child
        mesh_drop_empty = Checkbutton(mesh_display_options_bottom_frm, text="Drop empty nodes",
                                      variable=self.mesh_drop_empty_var, onvalue=True,
                                      offvalue=False, style="primary.TCheckbutton", db_w=True,
                                      mesh_w=True)
        mesh_drop_empty.pack(side="left", padx=2)
        create_tooltip(mesh_drop_empty, "Drop nodes who have no further children and 0 counts")

        # labels ('all', 'propagate', 'none')
        mesh_label = Combobox(mesh_display_options_bottom_frm, textvariable=self.mesh_label_var,
                              state="readonly", width=11, values=["all", "propagation", "none"],
                              db_w=True, mesh_w=True)
        mesh_label.pack(side="right", padx=2)
        create_tooltip(mesh_label, "Enables/Disables display of labels inside sunburst wedges")

        mesh_label_label = Label(mesh_display_options_bottom_frm, text="Display Labels:",
                                 style="primary.TLabel", db_w=True, mesh_w=True)
        mesh_label_label.pack(side="right", padx=2)

        # propagation subframe
        mesh_propagate_frm = LabelFrame(p_options_frm, text="Propagation",
                                        style="primary_sub.TLabelframe")
        mesh_propagate_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")
        self.mesh_propagate_enabled_control.set(False)
        self.mesh_propagate_enable = Checkbutton(mesh_propagate_frm, text="Enable",
                                                 style="primary.TCheckbutton",
                                                 db_w=True, mesh_w=True,
                                                 onvalue=True, offvalue=False,
                                                 variable=self.mesh_propagate_enabled_control,
                                                 command=partial(self.checkbox_controller,
                                                                 "mesh_propagate"))
        self.mesh_propagate_enable.pack(side="left", padx=2)
        create_tooltip(self.mesh_propagate_enable,
                       "Select to enable propagation of counts and colors based on ontology level")

        # propagate color specificity
        self.mesh_propagate_color_lbl = Label(mesh_propagate_frm, text="Color:",
                                              style="primary.TLabel")
        self.mesh_propagate_color_lbl.pack(side="left", padx=2)
        self.mesh_propagate_color_lbl.configure(state="disabled")
        create_tooltip(self.mesh_propagate_color_lbl,self.propagate_color_mesh_tt)
        self.mesh_propagate_color = Combobox(mesh_propagate_frm,
                                             textvariable=self.mesh_propagate_color_var,
                                             width=10,
                                             state="readonly",
                                             values=["off", "specific", "global", "phenotype"])
        self.mesh_propagate_color.pack(side="left", padx=2)
        self.mesh_propagate_color.configure(state="disabled")
        create_tooltip(self.mesh_propagate_color, self.propagate_color_mesh_tt)

        # propagate counts
        self.mesh_propagate_counts_lbl = Label(mesh_propagate_frm, text="Counts:",
                                               style="primary.TLabel")
        self.mesh_propagate_counts_lbl.pack(side="left", padx=2)
        self.mesh_propagate_counts_lbl.configure(state="disabled")
        create_tooltip(self.mesh_propagate_counts_lbl, self.propagate_counts_tt)
        self.mesh_propagate_counts = Combobox(mesh_propagate_frm,
                                              textvariable=self.mesh_propagate_counts_var,
                                              state="readonly",
                                              values=["off", "level", "all"],
                                              width=4)
        self.mesh_propagate_counts.pack(side="left", padx=2)
        self.mesh_propagate_counts.configure(state="disabled")
        create_tooltip(self.mesh_propagate_counts, self.propagate_counts_tt)

        # propagate level
        self.mesh_propagate_lvl_lbl = Label(mesh_propagate_frm, text="Level: ",
                                            style="primary.TLabel")
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

        # summary plot subframe
        mesh_summary_plot_frm = LabelFrame(p_options_frm, text="Plot",
                                           style="primary_sub.TLabelframe")
        mesh_summary_plot_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")

        # checkbutton to toggle overview / detailed view
        self.mesh_summary_plot_cols = Entry(mesh_summary_plot_frm, width=2, validate="focusout",
                                            validatecommand=partial(self.overview_entry_validation,
                                                                    "mesh"))
        self.mesh_summary_plot_cols.insert(0, "5")
        self.mesh_summary_plot = Checkbutton(mesh_summary_plot_frm, text="Summary",
                                             style="primary.TCheckbutton", db_w=True, mesh_w=True,
                                             variable=self.mesh_summary_plot_control, onvalue=True,
                                             offvalue=False,
                                             command=partial(self.checkbox_controller,
                                                             "mesh_summary_plot"))
        self.mesh_summary_plot.pack(side="left", padx=2)
        self.mesh_summary_plot_lbl = Label(mesh_summary_plot_frm, text="Columns: ",
                                           style="primary.TLabel")
        self.mesh_summary_plot_lbl.pack(side="left", padx=2)
        self.mesh_summary_plot_cols.pack(side="left", padx=2)
        create_tooltip(self.mesh_summary_plot_cols,
                       "Enter amount of columns in range (1..20)ALT:Enable 'Summary Plot' "
                       "to modify amount of columns")
        create_tooltip(self.mesh_summary_plot,
                       "Select to plot all data in a combined overview (resource intensive, "
                       "set Labels to 'none' for faster loading)")

        self.mesh_plot_type = Combobox(mesh_summary_plot_frm,
                                       textvariable=self.mesh_plot_type_var,
                                       state="readonly",
                                       values=[str(_) for _ in self.p.plot_type.keys()],
                                       width=14,
                                       mesh_w=True)
        self.mesh_plot_type.pack(side="right", padx=2)
        create_tooltip(self.mesh_plot_type, "Select type of plot to generate")

        # run buttons frame
        p_run_frm = Frame(p_frm, style="primary.TFrame")
        p_run_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="x")

        # plot button
        mesh_plot = Button(p_run_frm, text="Plot", style="primary.TButton",
                           command=partial(self.plot, "mesh"), db_w=True, mesh_w=True)
        mesh_plot.pack(side="right", padx=2)
        create_tooltip(mesh_plot, self.plot_tt_template)

        # save plot button
        save_plot_btn = Checkbutton(p_run_frm, text="Save", style="primary.TCheckbutton",
                                    variable=self.export_plot_var, db_w=True, mesh_w=True)
        save_plot_btn.pack(side="right", padx=2)
        create_tooltip(save_plot_btn, self.save_plot_tt_template)

        if db_functions:
            # export button
            mesh_export = Button(p_run_frm, text="Export", style="primary.TButton",
                                 command=self.mesh_export, db_w=True)
            mesh_export.pack(side="right", padx=2)
            create_tooltip(mesh_export, self.export_tt_template)

    def build_atc_ui(self, db_functions: bool = None):
        """Builds ATC-drug specific controls if proper file was loaded

        :param db_functions: if True, database related widgets are generated
        """

        # ###################################### DRUG/ATC SUNBURST ############################### #

        # top frame
        d_frm = LabelFrame(self.atc_frame, text="Display Settings", style="primary.TLabelframe")
        d_frm.pack(ipadx=2, ipady=2, fill="both")

        if db_functions:
            # query data frame
            atc_data_frm = LabelFrame(d_frm, text="Query Data", style="primary_sub.TLabelframe")
            atc_data_frm.pack(ipadx=2, ipady=2, padx=4, pady=2, anchor="w")

            # asset subframe
            atc_asset_frm = Frame(atc_data_frm, style="primary.TFrame")
            atc_asset_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")
            atc_asset_label = Label(atc_asset_frm, text="Asset name:", style="primary.TLabel",
                                    db_w=True, width=12)
            atc_asset_label.pack(side="left", padx=2)
            atc_asset = Entry(atc_asset_frm, db_w=True, textvariable=self.atc_asset_var, width=40)
            atc_asset.pack(side="left", padx=(2, 10))
            create_tooltip(atc_asset, "Enter phenotype name (e.g. headache, case sensitive)")

            # data source subframe
            atc_data_source_frm = Frame(atc_data_frm, style="primary.TFrame")
            atc_data_source_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")
            atc_data_source_label = Label(atc_data_source_frm, text="Data source:",
                                          style="primary.TLabel", db_w=True, width=12)
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
        d_options_frm = Frame(d_frm, style="primary.TFrame")
        d_options_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, anchor="w")

        # general options subframe
        atc_display_options_frm = LabelFrame(d_options_frm, text="General",
                                             style="primary_sub.TLabelframe")
        atc_display_options_frm.pack(fill="both")

        # colors subframe
        atc_display_options_top_frm = Frame(atc_display_options_frm, style="primary.TFrame")
        atc_display_options_top_frm.pack(fill="both", pady=2)

        # set color scale button
        self.color_scale_btn_atc = Button(atc_display_options_top_frm, text="Set Color Scale",
                                          style="primary.TButton", db_w=True, atc_w=True,
                                          command=lambda: ColorScalePopup(self))
        self.color_scale_btn_atc.pack(side="left", padx=2)
        create_tooltip(self.color_scale_btn_atc,
                       self.color_scale_tt_template + self.color_scale_var.get())

        # set border button
        self.show_border_btn_atc = Button(atc_display_options_top_frm, text="Set Border",
                                          style="primary.TButton", db_w=True, atc_w=True,
                                          command=lambda: BorderPopup(self))
        self.show_border_btn_atc.pack(side="left", padx=2)
        create_tooltip(self.show_border_btn_atc, self.show_border_tt_template
                       + "\nCurrent properties: Color: " + self.border_color.get()
                       + ", Width: " + self.border_width.get())

        # display legend checkmark
        self.atc_legend_enable = Checkbutton(atc_display_options_top_frm, text="Legend",
                                             style="primary.TCheckbutton", db_w=True,
                                             atc_w=True, onvalue=True, offvalue=False,
                                             variable=self.atc_legend_enabled_control)
        self.atc_legend_enable.pack(side="right", padx=2)
        create_tooltip(self.atc_legend_enable,
                       "Displays a legend in form of a weighted color bar. "
                       "Disabled for summary plots with specific color propagation enabled.")

        mesh_display_options_bottom_frm = Frame(atc_display_options_frm, style="primary.TFrame")
        mesh_display_options_bottom_frm.pack(fill="both", pady=(0, 2))

        # labels
        atc_label = Combobox(mesh_display_options_bottom_frm,
                             textvariable=self.atc_label_var,
                             state="readonly",
                             width=11,
                             values=["all", "propagation", "drugs", "none"],
                             db_w=True,
                             atc_w=True)
        atc_label.pack(side="right", padx=2)
        create_tooltip(atc_label, "Enables/Disables display of labels inside sunburst wedges")
        atc_label_label = Label(mesh_display_options_bottom_frm, text="Display Labels:",
                                style="primary.TLabel", db_w=True, atc_w=True)
        atc_label_label.pack(side="right", padx=2)

        # wedge width
        atc_wedge_width_label = Label(mesh_display_options_bottom_frm, text="Wedge Width:",
                                      style="primary.TLabel", db_w=True, atc_w=True)
        atc_wedge_width_label.pack(side="left", padx=2)
        atc_wedge_width = Combobox(mesh_display_options_bottom_frm,
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

        # propagation subframe
        atc_propagate_frm = LabelFrame(d_options_frm, text="Propagation",
                                       style="primary_sub.TLabelframe")
        atc_propagate_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")
        self.atc_propagate_enabled_control.set(False)
        self.atc_propagate_enable = Checkbutton(atc_propagate_frm,
                                                text="Enable",
                                                style="primary.TCheckbutton",
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
                                             style="primary.TLabel")
        self.atc_propagate_color_lbl.pack(side="left", padx=2)
        self.atc_propagate_color_lbl.configure(state="disabled")
        create_tooltip(self.atc_propagate_color_lbl, self.propagate_color_tt)
        self.atc_propagate_color = Combobox(atc_propagate_frm,
                                            textvariable=self.atc_propagate_color_var,
                                            state="readonly",
                                            values=["off", "specific", "global"],
                                            width=10)
        self.atc_propagate_color.pack(side="left", padx=2)
        self.atc_propagate_color.configure(state="disabled")
        create_tooltip(self.atc_propagate_color, self.propagate_color_tt)

        # propagate counts
        self.atc_propagate_counts_lbl = Label(atc_propagate_frm, text="Counts:",
                                              style="primary.TLabel")
        self.atc_propagate_counts_lbl.pack(side="left", padx=2)
        self.atc_propagate_counts_lbl.configure(state="disabled")
        create_tooltip(self.atc_propagate_counts_lbl, self.propagate_counts_tt)
        self.atc_propagate_counts = Combobox(atc_propagate_frm,
                                             textvariable=self.atc_propagate_counts_var,
                                             state="readonly",
                                             values=["off", "level", "all"],
                                             width=4)
        self.atc_propagate_counts.pack(side="left", padx=2)
        self.atc_propagate_counts.configure(state="disabled")
        create_tooltip(self.atc_propagate_counts, self.propagate_counts_tt)

        # propagate level
        self.atc_propagate_lvl_lbl = Label(atc_propagate_frm, text="Level: ",
                                           style="primary.TLabel")
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

        # summary plot subframe
        atc_summary_plot_frm = LabelFrame(d_options_frm, text="Plot",
                                          style="primary_sub.TLabelframe")
        atc_summary_plot_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="both")

        # checkbutton to toggle overview / detailed view
        self.atc_summary_plot_cols = Entry(atc_summary_plot_frm, width=2, validate="focusout",
                                           validatecommand=partial(self.overview_entry_validation,
                                                                   "atc"))
        self.atc_summary_plot_cols.insert(0, "5")
        self.atc_summary_plot = Checkbutton(atc_summary_plot_frm,
                                            text="Summary",
                                            style="primary.TCheckbutton",
                                            db_w=True,
                                            atc_w=True,
                                            variable=self.atc_summary_plot_control,
                                            onvalue=True,
                                            offvalue=False,
                                            command=partial(self.checkbox_controller,
                                                            "atc_summary_plot"))
        self.atc_summary_plot.pack(side="left", padx=2)
        self.atc_summary_plot_lbl = Label(atc_summary_plot_frm, text="Columns: ",
                                          style="primary.TLabel")
        self.atc_summary_plot_lbl.pack(side="left", padx=2)
        self.atc_summary_plot_cols.pack(side="left", padx=2)
        create_tooltip(self.atc_summary_plot_cols,
                       "Enter amount of columns in range (1..20)ALT:Enable 'Summary Plot' "
                       "to modify amount of columns")
        create_tooltip(self.atc_summary_plot,
                       "Select to plot all data in a combined overview (resource intensive, "
                       "set Labels to 'none' for faster loading)")

        # run buttons frame
        d_run_frm = Frame(d_frm, style="primary.TFrame")
        d_run_frm.pack(ipadx=2, ipady=2, padx=2, pady=2, fill="x")

        # plot
        atc_plot = Button(d_run_frm, text="Plot", style="primary.TButton",
                          command=partial(self.plot, "atc"),
                          db_w=True, atc_w=True)
        atc_plot.pack(side="right", padx=2)
        create_tooltip(atc_plot, self.plot_tt_template)

        # save plot button
        save_plot_btn = Checkbutton(d_run_frm, text="Save", style="primary.TCheckbutton",
                                    variable=self.export_plot_var, db_w=True, atc_w=True)
        save_plot_btn.pack(side="right", padx=2)
        create_tooltip(save_plot_btn, self.save_plot_tt_template)

        if db_functions:
            # export
            atc_export = Button(d_run_frm, text="Export", style="primary.TButton",
                                command=self.atc_export, db_w=True)
            atc_export.pack(side="right", padx=2)
            create_tooltip(atc_export, self.export_tt_template)

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
        elif mode == "db":
            controller_widgets = [self.atc_propagate_enable, self.atc_summary_plot,
                                  self.mesh_propagate_enable, self.mesh_summary_plot]

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
            for controller_widget in controller_widgets:
                for child in controller_widget.master.winfo_children():
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
        else:
            target_var.set(target_value)
            self.set_status("")
        return False

    def check_init(self, obj: [MeSHSunburst, ATCSunburst] = None) -> bool:
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
            if isinstance(obj, MeSHSunburst):
                self.set_status("Initializing MeSH-tree ..")
                self.p.init(self.database_var.get())
            elif isinstance(obj, ATCSunburst):
                self.set_status("Initializing ATC-tree ..")
                self.d.init(self.database_var.get())

        return obj.is_init

    def set_status(self, text: str = None):
        """Set global status in GUI
        :param text: Text to display as status message
        """
        self.status_var.set("\n".join(textwrap.wrap(text, 65)))
        self.update()

    def configure_p(self):
        """Hand over GUI settings to MeSHSunburst object"""
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
        """Hand over GUI settings to ATCSunburst object"""
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

    def toggle_widgets(self, enable: bool = None, mode: str = None, dedicated_parent: [Frame, LabelFrame] = None):
        """Enables/disables widgets in GUI"""
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

        self._toggle_widgets_recursive(parent, state, combo_state, mode, wdgs)
        self.update()

    def _toggle_widgets_recursive(self, parent, state, combo_state, mode, wdgs):
        """Recursive function to set states for widgets at any depth."""

        for child in parent.winfo_children():
            if isinstance(child, wdgs) and self.is_eligible_for_toggle(child=child, mode=mode):
                child.configure(state=state)
            elif isinstance(child, Combobox) and self.is_eligible_for_toggle(child=child, mode=mode):
                child.configure(state=combo_state)
            elif isinstance(child, (LabelFrame, Frame)):
                self._toggle_widgets_recursive(child, state, combo_state, mode, wdgs)

    @staticmethod
    def is_eligible_for_toggle(child: [Frame, Button, Checkbutton, Entry, Label, Radiobutton, Combobox] = None,
                               mode: str = None):
        return mode == "db" and child.db_w or mode == "mesh" and child.mesh_w or mode == "atc" and child.atc_w

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
        self.status_frame = LabelFrame(self, text="Status", style="dark.TLabelframe")
        self.status_frame.pack(ipadx=2, ipady=2, fill="both")
        status = Label(self.status_frame, textvariable=self.status_var, style="dark.TLabel")
        status.pack(padx=2)
        self.update()

    def set_database(self, db_path: str = None):
        """Prompt to set database, extracts .tar.gz or verifies chosen .db file, sets class variable

        :param db_path: If path to database is given, only integrity is verified without opening a dialog
        """
        if not db_path:
            db_path = filedialog.askopenfilename(title="Database",
                                                 filetypes=[("DrugVision SQLite3 database",
                                                             ".db .tar.gz"),
                                                            ("All files", "*")])

        if not db_path:
            return

        if db_path.endswith(".db"):
            if self.p.verify_db(db_path):
                self.database_var.set(db_path)
                self.build_mesh_ui(db_functions=True)
                self.build_atc_ui(db_functions=True)
                self.update()
                self.toggle_widgets(enable=True, mode="db")
                self.atc_file_loaded = ""
                self.mesh_file_loaded = ""
            else:
                messagebox.showerror("Database", f"Database {db_path} could not be verified.")

        elif db_path.endswith(".tar.gz"):
            messagebox.showinfo("Database", "Unpacking database archive .. "
                                            "GUI will be unresponsive until finished")
            with tarfile.open(db_path, "r:gz") as tar:
                print(f"Extracting {db_path} ..")
                names = tar.getnames()
                tar.extractall()
            db_path = db_path.rstrip(".tar.gz") + ".db"
            if os.path.isfile(db_path):
                messagebox.showinfo("Database", f"Successfully extracted {db_path}")
                self.set_database(db_path)
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
        input_fn = None
        obj = None
        configure = None
        asset = None
        datasource = None
        legend = None
        cfg_exclude = ""
        plot_type = None

        # assign variables based on mode
        if mode == "atc":
            input_fn = self.atc_file_loaded
            populate_data_source = self.d.populate_atc_from_data_source
            populate_tsv = self.d.populate_atc_from_tsv
            populate_excel = self.d.load_atc_excel
            obj = self.d
            configure = self.configure_d
            asset = self.atc_asset_var.get()
            datasource = self.atc_data_source_var.get()
            legend = self.atc_legend_enabled_control.get()
            cfg_exclude = "mesh_"
            plot_type = None
        elif mode == "mesh":
            input_fn = self.mesh_file_loaded
            populate_data_source = self.p.populate_mesh_from_data_source
            populate_tsv = self.p.populate_mesh_from_tsv
            populate_excel = self.p.load_mesh_excel
            obj = self.p
            configure = self.configure_p
            asset = self.mesh_asset_var.get()
            datasource = self.mesh_data_source_var.get()
            legend = self.mesh_legend_enabled_control.get()
            cfg_exclude = "atc_"
            plot_type = self.mesh_plot_type_var.get()

        obj.s["legend"] = legend
        obj.s["plot_type"] = plot_type

        # populate tree from Excel or database data
        if asset == "CUSTOM":
            self.set_status("Populating custom tree ..")
        else:
            self.set_status(f"Populating {mode.upper()} tree ..")
        if input_fn:
            if os.path.splitext(input_fn)[-1] == ".tsv":
                if datasource == "TSV file":
                    populate_tsv(input_fn)
                elif datasource.startswith("custom_sep_"):
                    self.p.populate_custom_ontology_from_tsv(fn=input_fn, ontology_type=datasource)
                else:
                    self.p.custom_ontology = build_non_separator_based_tree(file_name=input_fn,
                                                                            float_sep=self.custom_ontology_separator)
                    self.p.custom_ontology_title = os.path.abspath(input_fn).split(os.sep)[-1]
                    self.p.populate_custom_ontology_from_web()
            else:
                populate_excel(input_fn, read_settings=False, populate=True)
        else:
            # in case custom ontology was loaded, no file is specified
            if self.p.custom_ontology:
                self.p.populate_custom_ontology_from_web()
            else:
                # otherwise, verify db is loaded and populate tree
                if not self.check_init(obj):
                    return
                populate_data_source(asset, datasource)

        # update settings of core object based on current GUI configuration
        configure()

        # show warning once in case labels and summary plot is enabled
        if not self.performance_warning_shown and obj.s[f"{mode}_summary_plot"] \
                and obj.s[f"{mode}_labels"] == "all":
            messagebox.showwarning(title="Performance of plot",
                                   message="Displaying very large ontologies as a summary plot and "
                                           "displaying all associated labels may result in longer "
                                           "loading times and less responsive interaction in the "
                                           "browser.")
            self.performance_warning_shown = True

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
        if obj.plot_error:
            self.set_status("Failed to display incompatible ontology")
            raise Exception(obj.plot_error)

        self.set_status("Plot displayed in browser")

        # in case self.export_plot_var.get() is checked (sets config param "export_plot"),
        # thread will return generated .html and .tsv file paths
        thread_ret = obj.thread_return
        if thread_ret:
            html_path, tsv_path = thread_ret

            # show both filenames as info popup
            messagebox.showinfo("Export Plot", f"Exported plot to:\n{html_path}\n\nExported "
                                               f"template to:\n{tsv_path}")

        # prompt to overwrite Excel file if settings changed since load
        if input_fn and input_fn.endswith(".xlsx"):
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
                    settings = [(k, v) for k, v in obj.s.items()
                                if not k.startswith(cfg_exclude) and k != "default_color"]
                    out_fn = obj.export_settings(fn=input_fn, settings=settings)
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
    def load_url(self):
        """Download and visualize a .obo ontology"""

        self.obo = SelectOptionsPopup(
            parent=self,
            title="Choose Ontology",
            info_text="Select Ontology to download and visualize,\nor define a custom .obo URL",
            is_ontology_popup=True,
            options={
                "hpo": ("Human Phenotype Ontology", self.hpo_ontology_tt),
                "go_mf": ("Gene Ontology (molecular function)",
                          "Fetches the GeneOntology (namespace: molecular_function) "
                          f"{self.gene_ontology_tt}"),
                "go_cp": ("Gene Ontology (cellular component)",
                          "Fetches the GeneOntology (namespace: cellular_component) "
                          f"{self.gene_ontology_tt}"),
                "go_bp": ("Gene Ontology (biological process)",
                          "Fetches the GeneOntology (namespace: biological_process) "
                          f"{self.gene_ontology_tt}"),
                # "po": ("Plant Ontology", self.po_ontology_tt),
                "cl": ("Cell Ontology", self.cl_ontology_tt),
                # "chebi": ("CHEBI Ontology", self.chebi_ontology_tt),
                # "uberon": ("Uberon Anatomy Ontology", self.uberon_ontology_tt),
                "doid": ("Human Disease Ontology", self.doid_ontology_tt),
                "custom_url": ("Custom URL", "Specify a custom .obo url"),
            },
        )

        description = self.obo.description
        ontology = self.obo.result
        if not ontology:
            self.set_status("Aborted ontology download")
            return

        self.rollback_ontology_variables()
        self.p.custom_ontology = get_remote_ontology(ontology_short=ontology, app=self)
        self.p.custom_ontology_title = description

        # set core object settings, assign functions, set status, rollback ui
        self.rollback_ui()
        self.change_theme_color(foreground=self.d4_black, background=self.d4_custom)
        self.build_mesh_ui(db_functions=False)
        self.mesh_label_var.set("none")  # hide labels
        self.mesh_legend_enabled_control.set(False)  # disable legend
        self.mesh_data_source_var.set(ontology)
        self.mesh_asset_var.set(description)
        self.title(f"OntoloViz - {description}")
        self.reset_load_button_styles()
        self.recent_ui_toggle_mode = "mesh"
        self.update()

    @exception_as_popup
    def load_file(self):
        """Prompt to load Excel/.tsv file

        If file ends on .xlsx: verify file and get tree type based on option in 'Settings'
            and number of columns in 'Tree' tabs, enable/disable and configure respective widgets
        """
        input_fn = filedialog.askopenfilename(filetypes=[("Tree Table", ".xlsx .tsv"),
                                                         ("SQLite3 database", ".db .tar.gz"),
                                                         ("All files", "*")],
                                              title="Load ontology from file")
        if not input_fn:
            return

        self.rollback_ontology_variables()
        obj = None

        if input_fn.endswith(".db") or input_fn.endswith(".tar.gz"):
            self.set_database(input_fn)
            return

        # verify file
        tree_type = self.p.verify_file(input_fn)
        custom_ontology = None
        if not tree_type:
            if input_fn.endswith("xlsx"):
                messagebox.showerror(title="File format not supported",
                                     message="The input file could not be automatically identified,"
                                             " custom ontologies are only supported for .tsv files."
                                             " Convert your data to .tsv, and follow the guidelines"
                                             " from https://github.com/Delta4AI/OntoloViz")
                return
            _custom_ontology = SelectOptionsPopup(
                parent=self, title="Choose Ontology Type",
                info_text="The ontology type could not be detected automatically. "
                          "What type of ontology are you trying to import? "
                          "Find out about the supported structures at "
                          "https://github.com/Delta4AI/OntoloViz",
                options={
                    "custom_sep_dot": ("Dot-separated", "e.g. MeSH: 'C01.001.002'"),
                    "custom_sep_slash": ("Slash-separated", "e.g. C01/001/002"),
                    "custom_sep_colon": ("Colon-separated", "e.g. C01,001,002"),
                    "custom_sep_underscore": ("Underscore-separated", "e.g. C01_001_002"),
                    "custom_non_sep": ("Parent-based",
                                       "Unstructured ontologies that do not follow a structured "
                                       "schema, e.g. HPO IDs in the format: HP:0001300\nRequires "
                                       "6 column layout and defined parent-id for each node:\n"
                                       "-------------------------------------------------\n"
                                       "ID | Parent | Label | Description | Count | Color")
                }
            )
            custom_ontology = _custom_ontology.description
            tree_type = _custom_ontology.result
            self.custom_ontology_separator = _custom_ontology.separator
            if not tree_type:
                self.set_status("Aborted file loading")
                return

        # set core object settings, assign functions, set status, rollback ui
        self.rollback_ui()
        self.set_status("")
        if tree_type.startswith("atc"):
            self.set_status("Loading ATC tree from file ..")
            self.change_theme_color(foreground=self.d4_white, background=self.d4_red)
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
            self.change_theme_color(foreground=self.d4_white, background=self.d4_purple)
            self.build_mesh_ui(db_functions=False)
            self.update()
            if tree_type == "mesh_excel":
                self.p.load_mesh_excel(fn=input_fn, read_settings=True, populate=False)
                self.mesh_data_source_var.set("Excel file")
            elif tree_type == "mesh_tsv":
                self.mesh_data_source_var.set("TSV file")
            self.mesh_asset_var.set(self.p.drug_name)
            obj = self.p
        else:
            # custom ontologies
            self.set_status("Loading custom ontology from file ..")
            self.change_theme_color(foreground=self.d4_black, background=self.d4_custom)
            self.build_mesh_ui(db_functions=False)
            self.update()
            self.mesh_data_source_var.set(tree_type)
            self.mesh_asset_var.set("CUSTOM")
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
            self.title("OntoloViz - ATC Ontology")
            if tree_type == "atc_excel":
                self.atc_label_var.set(obj.s["atc_labels"])
                self.atc_wedge_width_var.set(obj.s["atc_wedge_width"])
        elif tree_type.startswith("mesh"):
            self.toggle_widgets(enable=True, mode="mesh")
            self.set_status(f"MeSH tree loaded: {input_fn}")
            self.mesh_file_loaded = input_fn
            self.title("OntoloViz - MeSH Ontology")
            if tree_type == "mesh_excel":
                self.mesh_drop_empty_var.set(obj.s["mesh_drop_empty_last_child"])
                self.mesh_label_var.set(obj.s["mesh_labels"])
        else:
            # custom ontologies
            self.toggle_widgets(enable=True, mode="mesh")
            self.set_status(f"Custom tree loaded: {input_fn}")
            self.mesh_file_loaded = input_fn
            self.title(f"OntoloViz - {custom_ontology} Ontology")

        # store settings to check later if they have been modified if Excel was loaded
        if tree_type.endswith("_excel"):
            self.loaded_settings = {k: v for k, v in obj.s.items()}

        # reset button style
        self.reset_load_button_styles()

    def reset_load_button_styles(self):
        """Resets the styles of the load file buttons and removes green outline"""
        self.load_file_btn.configure(style="dark.TButton")
        self.load_obo_url_btn.configure(style="dark.TButton")

    def rollback_ontology_variables(self):
        """Rolls back some of the variables for loading a new file properly"""
        self.atc_file_loaded = ""
        self.mesh_file_loaded = ""
        self.p.custom_ontology = None
        self.p.custom_ontology_title = None
        self.loaded_settings = {}
        self.custom_ontology_separator = None


def run_app():
    """Creates instance of App, launches mainloop"""
    print("Launching OntoloViz GUI ..")
    app = App()
    app.mainloop()


if __name__ == "__main__":
    run_app()
