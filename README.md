[![Pypi version](https://img.shields.io/pypi/v/OntoloViz.svg)](https://pypi.python.org/pypi/ontoloviz)
[![Pypi python version](https://img.shields.io/pypi/pyversions/ontoloviz)](https://img.shields.io/pypi/pyversions/ontoloviz)
[![Python package](https://github.com/Delta4AI/OntoloViz/actions/workflows/python-package.yml/badge.svg)](https://github.com/Delta4AI/OntoloViz/actions/workflows/python-package.yml)
[![pylint-badge](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/MNikley/303283c4b9026d59cda9e9dd9f697110/raw/pylint_badge.json)](https://github.com/Delta4AI/OntoloViz/actions/workflows/pylint.yml)
<!--- documentation for pylint-badge: https://github.com/marketplace/actions/dynamic-badges --->

---

<div style="text-align:center">
  <img src="https://github.com/Delta4AI/OntoloViz/assets/75040444/0b862f62-d0a6-4616-8021-2af2d0302ec2">
  <p>
    OntoloViz is a user-friendly interface that enables the creation of interactive sunburst plots for 
    biomedical ontologies. It allows you to conveniently visualize your data for reports or share the 
    generated plots with collaborators. Check out the <a href="#templates-and-examples">examples section</a>
    to download interactive .html examples and to gain a better understanding of the package's capabilities.
  </p>
</div>

---
Quickstart
==========
The GUI can be run by downloading the latest [release](https://github.com/Delta4AI/OntoloViz/releases) 
or by installing the package via PyPi (OS independent, requires **Python 3.8+**):

    pip install ontoloviz

After the installation you can run the GUI from the command line with the following command:

    ontoloviz

---
Usage
=====

The application allows importing `.tsv` and `.xlsx` files, but the use of `.tsv` and `tab` as a 
separator is recommended. The GUI can create two types of sunburst diagrams to represent either phenotype or drug 
ontologies, which is determined by the structure of the loaded files. Any numbers entered in the input file will be converted 
to integers and decimal points will be rounded.

GUI Options
-----------
<img height=250px alt="gui_small" src="https://user-images.githubusercontent.com/75040444/228182954-fb48a953-ec56-46db-81ad-816d9f356206.png">

**Load File**: load an `.tsv` or `.xlsx` file containing ontology data based below defined file formats

**Load from Web**: load an `.obo` ontology from a pre-defined list, or define a URL to any ontology

### General options
- **Set Color Scale**: define a custom color scale for the sunburst color scaling when color propagation is active
- **Set Border**: configures the border properties drawn around sunburst wedges
- **Drop empty nodes** (phenotype sunburst only): drops nodes who have no further children and 0 counts
- **Wedge Width** (drug sunburst only): switch from full outer circle (total) to count-based wedge widths (remainder)
- **Display Labels**: controls display of labels inside sunburst wedges, available options:
  - `all`
  - `propagation`
  - `drugs` (drug sunburst only)
  - `none`
- **Legend**: displays a weighted color bar (disabled for summary plots with specific color propagation enabled)

### Propagation options
- **Enable**: enables count- and color propagation from child to parent nodes
- **Color**: controls color propagation by the options:
  - `off`: color scale is based on 'Color' column from imported file
  - `specific`: color scale is based on the maximum values of the corresponding subtree
  - `global`: color scale is based on the maximum values of the entire tree ontology
  - `phenotype` (phenotype sunburst only): Only the most outer phenotype in a branch is colored
- **Counts**: controls count propagation by the options:
  - `off`: no counts are propagated, counts equal imported values
  - `level`: counts are propagated up to defined level, values above threshold remain unchanged
  - `all`: counts are propagated up to central node, imported values are corrected and overwritten
- **Level**: controls color- and count-propagation from outer to inner levels up to defined level
  - affects color propagation when **Color** is set to `specific` or `global`
  - affects count propagation when **Counts** is set to `level`
  - drug sunburst: 1 corresponds to the central node, 5 to the outermost node (=drug)
  - phenotype sunburst: 0 corresponds to the central node, 13 to the outermost node

### Summary options
- **Enable**: displays all available subtrees in a single view
  (resource intensive, set Labels to `none` for faster loading)
- **Columns**: defines the amount of columns when summary plot is enabled

### Save and Plot options
- **Save**: when enabled, an interactive `.html` file containing the plot as well as a `.tsv` file containing the ontology data based on the current settings is generated for later use
- **Plot**: Process and generate plot, opens in a Browser window

---

MeSH Ontology
--------------
This separator-based ontology follows the principles of the [MeSH tree](https://www.nlm.nih.gov/mesh/intro_trees.html).
- A Tree ID is defined by a **combination of three numbers or letters**, for example `C01`.
- Levels are separated by a **dot `.`**, for example `C01.001`.
- Ontologies **up to thirteen hierarchical levels** are supported.
- A single phenotype end-node can be assigned to multiple parent-nodes by specifying the parents tree ids as 
  a pipe separated string in the column `Tree ID`, for example `C01.001.001|C02.001.001`.
- If a child element is defined without a valid parent node existing, the GUI generates all parent elements with the default color and value 0. For example, the node `123.001` is automatically generated if only the child node `123.001.001` was defined. This works only if at least the most central node `123` was defined manually.
- Counts entered in the file will be converted to integers. If a node should be displayed without counts, use `0`.
- The loaded file must contain **7 columns** and follow the below structure to be correctly recognized:

| Column Index | Header Text   | Description                                                                    |
|--------------|---------------|--------------------------------------------------------------------------------|
| 0            | MeSH ID       | Required primary identifier of a node in format `C01.001`                      |
| 1            | Tree ID       | Required `\|` pipe delimited list of Tree IDs of a node (allows 1:N mappings)  |
| 2            | Name          | Optional label to be displayed inside the sunburst wedges                      |
| 3            | Description   | Optional description displayed in the sunburst wedge tooltip                   |
| 4            | Comment       | Optional comment displayed in the sunburst wedge tooltip                       |
| 5            | Counts [Name] | Required count for wedge weights, `Name` will be used as figure title          | 
| 6            | Color         | Optional color for the sunburst wedges, must be hex-string in format `#FFFFFF` |

---

ATC Ontology
------------
This kind of sunbursts have a fixed hierarchy of 5 levels and are based on the [ATC tree](https://www.who.int/tools/atc-ddd-toolkit/atc-classification).
- ATC codes are divided into five levels, which must follow the following naming conventions:
  - 1st level: letter
  - 2nd level: two numbers
  - 3rd level: letter
  - 4th level: letter
  - 5th level: two numbers
- Example ATC code: **A10BA02**
- The hierarchy does only allow 1:1 child-parent relationships, contrary to the other ontologies. 
  For example, if the drug `deltatonin` should be assigned to the 
  parent nodes `A01AA` and `B01BB`, it must be defined twice with the ids `A01AA01` and `B01BB01`.
- The loaded file must contain **6 columns** and follow the below structure to be correctly 
  recognized as a ATC ontology:

| Column Index | Header Text   | Description                                                                    |
|--------------|---------------|--------------------------------------------------------------------------------|
| 0            | ATC code      | Required primary identifier of a node in format `A10BA02`                      |
| 1            | Level         | Optional level as number, not used for building tree                           |
| 2            | Label         | Optional label to be displayed inside the sunburst wedges                      |
| 3            | Comment       | Optional comment displayed in the sunburst wedge tooltip                       |
| 4            | Counts [Name] | Required count for wedge weights, `Name` will be used as figure title          |
| 5            | Color         | Optional color for the sunburst wedges, must be hex-string in format `#FFFFFF` |

---

Custom Separator-based Ontologies
---------------------------------
OntoloViz supports loading of custom ontologies - if no known format is detected, a prompt will ask
whether the loaded file is a separator-based ontology or if it does contain identifiers with child- 
and parent-ids. For separator-based ontologies, the following separators are supported: `.` (dot), `,` (colon), `_` (underscore), `/` (slash).
To generate such an ontology, the following 5-column layout is required:

| Column Index | Header Text | Description                                                                                         |
|--------------|-------------|-----------------------------------------------------------------------------------------------------|
| 0            | ID          | Required node identifier of a node in format `A.1` - multiple IDs can be separated with `\|` (pipe) |
| 1            | Label       | Optional label to be displayed inside the sunburst wedges                                           |
| 2            | Comment     | Optional comment displayed in the sunburst wedge tooltip                                            |
| 3            | Count       | Optional count for wedge weights                                                                    |
| 4            | Color       | Optional color for the sunburst wedges, must be hex-string in format `#FFFFFF`                      |

---

Custom Parent-based Ontologies
------------------------------
For loading any ontology with arbitrary IDs that do not follow a structured schema, the definition of a child-parent relationship using a 6-column layout is required:

| Column Index | Header Text | Description                                                                                  |
|--------------|-------------|----------------------------------------------------------------------------------------------|
| 0            | ID          | Required node identifier in any format - multiple IDs can be separated with `\|` (pipe)      |
| 1            | Parent      | Required parent identifier in any format - if parent ID does not exist, node will be removed |
| 2            | Label       | Optional label to be displayed inside the sunburst wedges                                    |
| 3            | Comment     | Optional comment displayed in the sunburst wedge tooltip                                     |
| 4            | Count       | Optional count for wedge weights                                                             |
| 5            | Color       | Optional color for the sunburst wedges, must be hex-string in format `#FFFFFF`               |

---
Templates and Examples
======================

| Filename                                                                                                                                                     | Description                                                                                                                                                                                                                                                       |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [atc_example_covid_drugs_experimental.tsv](https://raw.githubusercontent.com/Delta4AI/OntoloViz/master/templates/atc_example_covid_drugs_experimental.tsv)   | ATC-based example with data from the [DrugBank](https://go.drugbank.com) indicating experimental drugs related to COVID-19.                                                                                                                                       |
| [atc_example_covid_drugs_trial_summary.tsv](https://raw.githubusercontent.com/Delta4AI/OntoloViz/master/templates/atc_example_covid_drugs_trial_summary.tsv) | ATC-based example with data from [publicly available clinical trial data](https://clinicaltrials.gov/) indicating drugs tested in clinical studies, one count represents usage in one study.                                                                      |
| [atc_template.tsv](https://raw.githubusercontent.com/Delta4AI/OntoloViz/master/templates/atc_template.tsv)                                         | ATC-based empty template of the [ATC](https://www.who.int/tools/atc-ddd-toolkit/atc-classification) tree based on the manually curated chemical database of bioactive molecules [ChEMBL v29](https://chembl.gitbook.io/chembl-interface-documentation/downloads). |
| [custom_template_parent_based.tsv](https://raw.githubusercontent.com/Delta4AI/OntoloViz/master/templates/custom_template_parent_based.tsv)                   | Template for creating your own ontology based on any child and parent terms.                                                                                                                                                                                      |
| [custom_template_separator_based.tsv](https://raw.githubusercontent.com/Delta4AI/OntoloViz/master/templates/custom_template_separator_based.tsv)             | Template to create your own ontology based on a separator-based tree structure - for this template the underscore character `_` has been used.                                                                                                                    |
| [mesh_example_pubmed_mapped.tsv](https://raw.githubusercontent.com/Delta4AI/OntoloViz/master/templates/mesh_example_pubmed_mapped.tsv)                       | MeSH-based example with data from the publicly available [PubMed](https://pubmed.ncbi.nlm.nih.gov/) database of publications (title + abstract), where disease-related MeSH terms were extracted and mapped to the MeSH-tree.                                     |
| [mesh_template.tsv](https://raw.githubusercontent.com/Delta4AI/OntoloViz/master/templates/mesh_template.tsv)                                                 | MeSH-based empty template of the [MeSH](https://meshb.nlm.nih.gov/treeView) tree `C` and `F03`. Terms are unique and mapped to all related parent nodes.                                                                                                          |
| [atc_example.html](https://raw.githubusercontent.com/Delta4AI/OntoloViz/master/templates/atc_example.html)                                                   | ATC-based sample plot generated with the provided `covid_drugs_trial_summary.tsv` file.                                                                                                                                                                           |
| [mesh_example.html](https://raw.githubusercontent.com/Delta4AI/OntoloViz/master/templates/mesh_example.html)                                                 | MeSH-based sample plot generated with the provided `covid_drugs_trial_summary.tsv` file.                                                                                                                                                                          |

---

Screenshots and Demos
=====================
<img width="90%" alt="demo_creation_of_template" src="https://user-images.githubusercontent.com/75040444/228224565-af02a994-00c7-4572-b1da-f1eeec8b6f8f.gif">

> **_Demo 1:_** Minimal example for creating a phenotype based ontology

<img width="90%" alt="demo_creation_of_template" src="https://user-images.githubusercontent.com/75040444/228226839-2ed34f87-7a7d-498a-9f16-fd940d05c18d.gif">

> **_Demo 2:_** Showcase of some of the features available in OntoloViz (used template: <a href="https://github.com/Delta4AI/OntoloViz/files/11088919/test_tree.zip">test_tree.zip</a>)

<img width="90%" alt="drug_single" src="https://user-images.githubusercontent.com/75040444/228172370-a042b9d1-81af-4172-8b41-4f8c9e9287b7.png">

> **_Screenshot 1:_**  Drug sunburst plot with enabled labels, counts propagated up to level 3

<img width="90%" alt="phenotype_overview" src="https://user-images.githubusercontent.com/75040444/228174582-82aaad41-f3d8-4152-8161-b8f9b1dfec67.png">

> **_Screenshot 2:_**  Summary phenotype sunburst plot with tooltip, counts propagated up to the central node, color coded

<table>
    <tr>
        <td>
            <img height=300px alt="color_scale" src="https://user-images.githubusercontent.com/75040444/228183209-6a591a3c-8729-45c9-a73b-817dce9252c1.png">
        </td>
        <td>
            <img height=300px alt="color_scale" src="https://user-images.githubusercontent.com/75040444/228183234-e6aecf82-64b4-4737-b5c3-95eb87b0fb59.png">
        </td>
    </tr>
</table>

> **_Screenshot 3 & 4:_**  Left: define automatic color scales based on defined counts with thresholds and hex color codes, Right: define border properties (width, opacity, colors) or disable them entirely

---

Special Thanks to
=================

* Paul Perco, who had the initial idea for this package and provided support throughout the entire process
* Andreas Heinzel, for inspiration regarding architectural- and software-related topics
* The Delta4 GmbH team for providing helpful inputs

---
Reference
=========
Matthias Ley, Andreas Heinzel, Lucas Fillinger, Klaus Kratochwill, Paul Perco, OntoloViz: a GUI for interactive visualization of ranked disease or drug lists using the MeSH and ATC ontologies, Bioinformatics Advances, 2023; vbad113, https://doi.org/10.1093/bioadv/vbad113

