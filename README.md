[![image](https://img.shields.io/pypi/v/ontoviz-bio.svg)](https://pypi.python.org/pypi/ontoviz-bio)

OntoloViz
=========

OntoloViz is a graphical user interface for the creation of interactive sunburst plots of phenotype and drug ontologies.
You might find it useful to quickly visualize your data for reports or to share the generated plots with collaborators.
Take a look at the [screenshot section](#screenshots) or explore examples in `.html` format from the
provided [templates.zip](https://github.com/Mnikley/OntoViz/releases/download/v1.0.3/templates.zip) archive to get a 
better understanding of the scope of the package.  

Quickstart
==========
The GUI can be run by downloading the latest [Windows release](https://github.com/Mnikley/OntoViz/releases) 
or by installing and running the package via PyPi (OS independent, requires **Python 3.10+**):

    pip install ontoviz-bio
    python -c "from ontoviz import run_app; run_app()"

Alternatively, you can clone this repository, install the required dependencies and launch the GUI:

    git clone https://github.com/Mnikley/OntoViz.git
    cd OntoViz
    pip install -r requirements.txt
    python src/ontoviz/app.py

Usage
=====

The application allows importing `.tsv` and `.xlsx` files, but the use of `.tsv` and `tab` as a 
separator is recommended. The GUI can create two types of sunburst diagrams to represent either phenotype or drug 
ontologies, which is determined by the structure of the loaded files. Any numbers entered in the file will be converted 
to integers.

GUI Options
-----------
![gui_small](https://user-images.githubusercontent.com/75040444/213717385-adb372a9-d0a4-4861-af9e-3fcb7a3c195d.jpg)

- General
  - **Load File**: load an `.tsv` or `.xlsx` file containing drug- or phenotype-ontology data
  - **Set Color Scale**: define a custom color scale for the sunburst color scaling when color propagation is active
  - **Set Border**: configures the border properties drawn around sunburst wedges
  - **Save Plot**: when enabled, an interactive `.html` file is generated for later use
- Display
  - **Drop empty** (phenotype sunburst only): drops nodes who have no further children and 0 counts
  - **Labels**: controls display of labels inside sunburst wedges, available options:
    - `all`
    - `propagation`
    - `drugs` (drug sunburst only)
    - `none`
- Summary Plot
  - **Enable**: displays all available subtrees in a single view (resource intensive, set Labels to `none` 
    for faster loading)
  - **Columns**: defines the amount of columns when summary plot is enabled
- Propagation
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

Phenotype Sunbursts
-------------------
The phenotype sunburst structure follows the principles of the 
[MeSH tree](https://www.nlm.nih.gov/mesh/intro_trees.html).
- A Tree ID is defined by a **combination of three numbers or letters**, for example `C01`.
- Levels are separated by a **dot `.`**, for example `C01.001`.
- Ontologies **up to thirteen hierarchical levels** are supported.
- A single phenotype end-node can be assigned to multiple parent-nodes by specifying the parents tree ids as 
  pipe separated string in the column `Tree ID`.
- When defining a child element which has no valid parent, the GUI will automatically generate the parent with the 
  default color and a 0 value. This will happen recursively. For example, if the input file defines a node with the 
  id `123.001.001`, but the nodes `123` and `123.001` are non-existent, they will be created.
- Counts entered in the file will be converted to integers. If a node should be displayed without counts, use `0`.
- The loaded file must contain **7 columns** and follow the below structure to be correctly recognized:

Phenotype Ontology File Structure
---------------------------------

| Column Index | Header Text   | Description                                                                    |
|--------------|---------------|--------------------------------------------------------------------------------|
| 0            | MeSH ID       | Required primary identifier of a node in format `C01.001`                      |
| 1            | Tree ID       | Required pipe delimited list of Tree IDs of a node (allows 1:N mappings)       |
| 2            | Name          | Optional label to be displayed inside the sunburst wedges                      |
| 3            | Description   | Optional description displayed in the sunburst wedge tooltip                   |
| 4            | Comment       | Optional comment displayed in the sunburst wedge tooltip                       |
| 5            | Counts [Name] | Required count for wedge weights, `Name` will be used as figure title          | 
| 6            | Color         | Optional color for the sunburst wedges, must be hex-string in format `#FFFFFF` |


Drug Sunbursts
--------------
The drug sunburst structure follows the principles of the 
[ATC tree](https://www.who.int/tools/atc-ddd-toolkit/atc-classification).
- ATC codes are divided into **five levels**, which must follow the following naming conventions:
  - 1st level: letter
  - 2nd level: two numbers
  - 3rd level: letter
  - 4th level: letter
  - 5th level: two numbers
- Example ATC code: **A10BA02**
- The hierarchy is built based on the above-mentioned format and does only allow 1:1 child-parent relationships
  (contrary to the phenotype structure). For example, if the drug `deltatonin` should be assigned to the 
  parent nodes `A01AA` and `B01BB`, it must be defined twice with the ids `A01AA01` and `B01BB01`.
- The loaded file must contain **6 columns** and follow the below structure to be correctly recognized as a phenotype 
  ontology:

Drug Ontology File Structure
----------------------------

| Column Index | Header Text   | Description                                                                    |
|--------------|---------------|--------------------------------------------------------------------------------|
| 0            | ATC code      | Required primary identifier of a node in format `A10BA02`                      |
| 1            | Level         | Optional level as number, not used for building tree                           |
| 2            | Label         | Optional label to be displayed inside the sunburst wedges                      |
| 3            | Comment       | Optional comment displayed in the sunburst wedge tooltip                       |
| 4            | Counts [Name] | Required count for wedge weights, `Name` will be used as figure title          |
| 5            | Color         | Optional color for the sunburst wedges, must be hex-string in format `#FFFFFF` |

Screenshots
===========
![atc_sample](https://user-images.githubusercontent.com/75040444/213471039-78082a44-1be2-4864-9fd2-540c8f7f23bf.jpg)
![mesh_sample](https://user-images.githubusercontent.com/75040444/213471097-5257d612-510a-4f15-b65c-2fba8bf812ea.jpg)

Templates and Examples
======================
Templates and examples can be found in the provided 
[templates.zip](https://github.com/Mnikley/OntoViz/releases/download/v1.0.3/templates.zip) archive.

- `pubmed_documents_mapped_to_mesh.tsv`: based on the [MeSH](https://meshb.nlm.nih.gov/treeView) subtree `C` from 2022. 
  Disease-related MeSH terms were extracted from the publicly available [PubMed](https://pubmed.ncbi.nlm.nih.gov/) 
  database (title + abstract) and further mapped to the nodes.

-  `mesh_tree_template.tsv`: empty template of the [MeSH](https://meshb.nlm.nih.gov/treeView) tree `C` and `F03`]. 
  Terms are unique and mapped to all related parent nodes.

-  `covid_drugs_trial_summary.tsv`: based on [publicly available clinical trial data](https://clinicaltrials.gov/) 
  related to COVID-19. One count represents one clinical trial.

- `atc_tree_template.tsv`: empty template of the [ATC](https://www.who.int/tools/atc-ddd-toolkit/atc-classification) 
  tree based on the manually curated chemical database of bioactive 
  molecules [ChEMBL v29](https://chembl.gitbook.io/chembl-interface-documentation/downloads).

- `drug_sunburst_example.html`: sample plot generated with the provided `covid_drugs_trial_summary.tsv` file.

- `phenotype_sunburst_example.html`: sample plot generated with the provided `covid_drugs_trial_summary.tsv` file.

Special Thanks to
=================

* Paul Perco, who had the initial idea for this package and provided support throughout the process
* Andreas Heinzel, who is an overall inspiration regarding all software- and non-software related topics
* The Delta4 GmbH team for providing various helpful inputs
