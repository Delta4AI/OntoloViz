import requests
import re
from typing import Union

zero = 0.000001337
fake_one = 1.000001337
white = "#FFFFFF"


def build_non_separator_based_tree(file_name: str = None, float_sep: str = None) -> dict:
    """Parse an ontology with child- and parent-ids from a file and build tree structure

    :param file_name: tab separated file with 6 columns:
        id, parent, label, description, count, color
    :param float_sep: if given, counts are considered as floating point values and converted based on given separator
    """
    tree, to_process = parse_file_to_extract_root_nodes_and_processable_lines(file_name, float_sep)

    while True:
        drop_idxs = handle_and_assign_nodes(to_process, tree)
        for idx in sorted(list(set(drop_idxs)), reverse=True):
            del to_process[idx]

        if not to_process:
            break

        print(f"Dropped: {len(drop_idxs)}, Left to process: {len(to_process)}")

    if float_sep:
        print("Normalizing float counts to int")
        normalize_tree_counts_from_float_to_int(tree)

    return tree


def handle_and_assign_nodes(to_process: list = None, tree: dict = None) -> list:
    drop_idxs = []
    for idx, (attempts, node) in enumerate(to_process):
        if attempts >= 20:
            print(f"Dropping node because no suitable parent was found after "
                  f"20 attempts: {node['id']}")
            drop_idxs.append(idx)
            continue

        for sub_tree_id, sub_tree in tree.items():
            parent = node["parent"]
            if parent in sub_tree.keys():
                node["level"] = tree[sub_tree_id][parent]["level"] + 1
                tree[sub_tree_id][node["id"]] = node
                drop_idxs.append(idx)

        to_process[idx][0] += 1
    return drop_idxs


def parse_file_to_extract_root_nodes_and_processable_lines(input_file: str = None, float_sep: str = None) -> tuple:
    tree = dict()
    to_process = list()
    duplicate_check = list()
    with open(file=input_file, mode="r", encoding="utf-8") as f_in:
        for line_idx, line in enumerate(f_in):
            if line_idx == 0:
                continue
            node_ids_unformatted, *line_data = line.rstrip("\n").split("\t")
            node_ids = node_ids_unformatted.split("|")
            for node_id in node_ids:
                original_node_id = node_id
                duplicate_count = duplicate_check.count(node_id) + 1
                if duplicate_count > 1:
                    node_id = f"{node_id}_{duplicate_count}"
                duplicate_check.append(original_node_id)
                handle_and_assign_root_nodes(node_id, tree, to_process, line_data, float_sep)

    return tree, to_process


def handle_and_assign_root_nodes(node_id: str = None, tree: dict = None, to_process: list = None,
                                 line_data: list = None, float_sep: str = None):
    parent = line_data[0]
    count = safe_convert_count(line_data[3], float_sep)
    color = line_data[4]

    node = {
        "id": node_id,
        "parent": parent,
        "level": 0,
        "label": line_data[1],
        "description": line_data[2],
        "counts": count if count != 0 else zero,
        "imported_counts": count if count != 0 else fake_one,
        "color": color if color else white
    }

    # populate first level of tree structure
    if not parent:
        tree[node_id] = {
            node_id: node
        }
    else:
        to_process.append([0, node])


def safe_convert_count(count_as_str: str = None, float_sep: str = None) -> Union[int, float]:
    def_value = 0.0 if float_sep else 0
    try:
        if float_sep:
            return float(count_as_str.replace(float_sep, "."))
        else:
            return int(count_as_str)
    except ValueError:
        return def_value


def normalize_tree_counts_from_float_to_int(tree: dict = None):
    max_val = find_max(tree)
    for main_node in tree:
        for sub_node in tree[main_node]:
            count = tree[main_node][sub_node]["counts"]
            if count != zero and count != fake_one:
                tree[main_node][sub_node]["counts"] = normalize_to_int(count, max_val)


def find_max(tree: dict):
    max_val = zero
    for main_node in tree:
        for sub_node in tree[main_node]:
            if tree[main_node][sub_node]["counts"] > max_val:
                max_val = tree[main_node][sub_node]["counts"]
    return max_val


def normalize_to_int(original_value: float = None, max_float: float = None, max_integer_value: int = 100) -> int:
    return int((original_value / max_float) * max_integer_value)


def get_remote_ontology(ontology_short: str = None, app: object = None, url: str = None,
                        root_id: str = None, min_node_size: int = None) -> dict:
    """Wrapper to get .obo ontologies based on identifiers"""
    if ontology_short == "hpo":
        return build_tree_from_obo_ontology(url="https://purl.obolibrary.org/obo/hp.obo",
                                            descriptor="Human phenotype ontology",
                                            root_id="HP:0000118",
                                            app=app)
    elif ontology_short in ["go_mf", "go_cp", "go_bp"]:
        raw_terms = parse_obo_file(url="https://current.geneontology.org/ontology/go.obo",
                                   descriptor="GeneOntology",
                                   app=app)
        # get GO root IDs and labels:
        root_terms = {v["label"]: v["id"] for k, v in raw_terms.items() if not v["is_a"]}
        root_term_translation = {
            "go_mf": "molecular_function",
            "go_cp": "cellular_component",
            "go_bp": "biological_process"
        }
        root_id = root_terms[root_term_translation[ontology_short]]
        return build_tree_from_obo_ontology(raw_terms=raw_terms,
                                            root_id=root_id,
                                            descriptor="GeneOntology",
                                            app=app,
                                            min_node_size=2)
    elif ontology_short == "po":
        return build_tree_from_obo_ontology(url="https://purl.obolibrary.org/obo/po.obo",
                                            descriptor="Plant Ontology",
                                            app=app,
                                            root_id="PO:0009011",
                                            min_node_size=5)
    elif ontology_short == "cl":
        return build_tree_from_obo_ontology(url="https://purl.obolibrary.org/obo/cl/cl-basic.obo",
                                            descriptor="Cell Ontology",
                                            app=app, min_node_size=2)
    elif ontology_short == "chebi":
        return build_tree_from_obo_ontology(
            url="https://purl.obolibrary.org/obo/chebi/chebi_lite.obo",
            descriptor="CHEBI Ontology",
            app=app,
            root_id="CHEBI:23367")
    elif ontology_short == "uberon":
        return build_tree_from_obo_ontology(url="https://purl.obolibrary.org/obo/uberon/basic.obo",
                                            descriptor="Uberon Anatomy Ontology",
                                            app=app,
                                            root_id="UBERON:0000061",
                                            min_node_size=2)
    elif ontology_short == "doid":
        return build_tree_from_obo_ontology(url="https://purl.obolibrary.org/obo/doid.obo",
                                            descriptor="Human Disease Ontology",
                                            app=app,
                                            root_id="DOID:4")
    elif ontology_short == "custom_url":
        return build_tree_from_obo_ontology(url=app.obo.custom_url,
                                            descriptor=app.obo.description,
                                            app=app,
                                            root_id=app.obo.root_id,
                                            min_node_size=app.obo.min_node_size)


def parse_obo_file(url: str = None, descriptor: str = None, app: object = None,
                   exclude_obsolete_terms: bool = True) -> dict:
    """ Downloads and parses an .obo file

    :param url: url of .obo file
    :param descriptor: descriptor used to show status in app
    :param app: tkinter App object
    :param exclude_obsolete_terms: if True, terms with "is_obsolete: true" will be excluded
    :return: dictionary containing raw parsed obo data
    """
    if app:
        app.set_status(f"Downloading {descriptor} ..")
    response = requests.get(url=url, stream=False)
    response.raise_for_status()

    # Read the response content in chunks
    chunks = []
    for chunk in response.iter_content(chunk_size=128 * 512):
        if app:
            app.set_status(f"Downloading {descriptor} .. {round(len(chunks) * 128 / 2048, 2)} MB")
        chunks.append(chunk.decode("utf-8"))

    # Concatenate the chunks into a single string
    text = ''.join(chunks).split("\n")

    # remove header block
    text = text[text.index("") + 1:]

    # parse and prepare data
    raw_terms = {}
    new_entity = None
    for line in text:
        if line == "[Term]":
            new_entity = {
                "id": None,
                "label": None,
                "namespace": None,
                "def": None,
                "comment": None,
                "is_obsolete": False,
                "xrefs": [],
                "is_a": [],
                "disjoint_from": [],
                "synonyms": [],
            }
        elif line.startswith("id: "):
            new_entity["id"] = line.replace("id: ", "")
        elif line.startswith("name: "):
            new_entity["label"] = line.replace("name: ", "")
        elif line.startswith("def: "):
            new_entity["def"] = line.replace('def: "', "").split('" [')[0]
        elif line.startswith("comment: "):
            new_entity["comment"] = line.replace("comment: ", "")
        elif line.startswith("xref: "):
            new_entity["xrefs"].append(line.replace("xref: ", ""))
        elif line.startswith("is_a: "):
            new_entity["is_a"].append(line.replace("is_a: ", "").split(" ! "))
        elif line.startswith("disjoint_from: "):
            new_entity["disjoint_from"].append(line.replace("disjoint_from: ", "").split(" ! "))
        elif line.startswith("namespace: "):
            new_entity["namespace"] = line.replace("namespace: ", "")
        elif line.startswith("synonym: "):
            new_entity["synonyms"].append(line.replace("synonym: ", "").lstrip('"').split('" '))
        elif line == "is_obsolete: true":
            new_entity["is_obsolete"] = True
        elif line == "":
            if exclude_obsolete_terms and new_entity["is_obsolete"]:
                continue
            raw_terms[new_entity["id"]] = new_entity

    return raw_terms


def build_tree_from_obo_ontology(url: str = None,
                                 descriptor: str = None,
                                 root_id: str = None,
                                 raw_terms: dict = None,
                                 app: object = None,
                                 min_node_size: int = None) -> dict:
    """Downloads and parses the HPO from a remote obo file

    :param url: url of hp.obo file
    :param descriptor: Descriptor for status prints
    :param root_id: ID of "Phenotypic abnormality" to mark starting-point for creation of subtrees
    :param raw_terms: pre-processed terms (skips download/parsing)
    :param app: App object used for status updates
    :param min_node_size: only keeps subtrees if node amount is greater than given value
    :return: dictionary containing tree with necessary parameters to plot
    """

    if not raw_terms:
        raw_terms = parse_obo_file(url=url, descriptor=descriptor, app=app)

    # build first level
    tree = {}
    if root_id:
        for node_id, val in raw_terms.items():
            for is_a in val["is_a"]:
                if root_id == is_a[0]:
                    tree[node_id] = {}
                    tree[node_id][node_id] = val
                    tree[node_id][node_id]["level"] = 0
                    tree[node_id][node_id]["parent"] = ""
    else:
        root_terms = [_["id"] for _ in raw_terms.values() if not _["is_a"]]
        for root_term in root_terms:
            tree[root_term] = {}
            tree[root_term][root_term] = raw_terms[root_term]
            tree[root_term][root_term]["level"] = 0
            tree[root_term][root_term]["parent"] = ""

    # propagate
    iterations = 0
    while True:
        had_content = False
        for sub_tree_id, sub_tree in tree.items():
            for node_id, node in raw_terms.items():
                for is_a in node["is_a"]:
                    is_a_id = is_a[0]
                    if is_a_id in sub_tree.keys() and node_id not in sub_tree.keys():
                        sub_tree[node_id] = {key: value for key, value in node.items()}
                        sub_tree[node_id]["level"] = sub_tree[is_a_id]["level"] + 1
                        sub_tree[node_id]["parent"] = is_a_id
                        had_content = True
        if not had_content:
            break
        else:
            iterations += 1
            if app:
                app.set_status(f"Building {descriptor} tree .. iteration #{iterations}")

    # just in case - clean nodes where parent doesn't exist
    cleaning_iterations = 0
    while True:
        nodes_with_missing_parent = []
        for sub_tree_id, sub_tree in tree.items():
            for key, val in sub_tree.items():
                if val["parent"] and val["parent"] not in sub_tree.keys():
                    nodes_with_missing_parent.append((sub_tree_id, key))

        if not nodes_with_missing_parent:
            break

        cleaning_iterations += 1
        print(f"Cleaning iteration {cleaning_iterations}")
        for sub_tree_id, node_id in nodes_with_missing_parent:
            del tree[sub_tree_id][node_id]

    # add zero counts, color and description
    for sub_tree in tree.values():
        for node in sub_tree.values():
            node["imported_counts"] = 1.000001337
            node["counts"] = 0.000001337
            node["color"] = "#FFFFFF"
            node["description"] = f"Definition: {node['def']}\nComment: {node['comment']}"

    if app:
        app.set_status(f"Parsed {descriptor}")

    if min_node_size:
        sub_tree_ids_to_drop = []
        for sub_tree_id, sub_tree in tree.items():
            if len(sub_tree) < min_node_size:
                sub_tree_ids_to_drop.append(sub_tree_id)
        for sub_tree_id in sub_tree_ids_to_drop:
            del tree[sub_tree_id]

    return tree


def sanitize_string(filename):
    # Define a regular expression pattern for illegal characters and newline
    illegal_chars_pattern = r'[<>:"/\\|?*\x00-\x1F\n]'

    # Replace illegal characters with an underscore
    sanitized_filename = re.sub(illegal_chars_pattern, '_', filename)

    return sanitized_filename
