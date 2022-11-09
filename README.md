# OntologyExplorer
MeSH- and ATC-Ontology Visualization Tool

## Setup

## Usage

### Included Files
#### MeSH / Phenotype
The MeSH template is based on a subset of the original MeSH Tree (F01, .. ). Furthermore, the MeSH terms were curated manually **(TODO: might use full phenotypes from phenotypes_for_curation here, also exchange in drugvision.db)**.
- `examples/mesh_tree_template.tsv` - Represent the raw tree structure without counts and colors to use with your own data
- `examples/mesh_tree_blabla.tsv` - Populated with real drug-data for **ferl**

** WICHTIG: file muss MeSH und Tree ID haben - für vollständigen baum müssen alle Tree IDs vorhanden sein! **
** WICHTIG: falls eine child-node keine parent-node hat wird diese künstlich erzeugt (keine counts, weiß, kein name/description) **

#### ATC / Drug
The ATC template is based on data from the manually curated chemical database of bioactive molecules [ChEMBL v29](https://chembl.gitbook.io/chembl-interface-documentation/downloads). **license issues [ATC](https://www.whocc.no/atc_ddd_index/) ? based on our own license ? **.
- `atc_tree_template.tsv` - Analogue to the `mesh_tree_template.tsv` for using your own data
- `atc_tree_bla.tsv` - Populated with real phenotype data for **gug**

** WICHTIG: falls eine child-node keine parent-node hat wird diese künstlich erzeugt (keine counts, weiß, kein name/description) **
