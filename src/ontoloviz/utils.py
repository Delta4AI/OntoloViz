import requests
import re

zero = 0.000001337
fake_one = 1.000001337


def build_non_separator_based_tree(file_name: str = None, app: object = None) -> dict:
    """Parse an ontology with child- and parent-ids from a file and build tree structure

    :param file_name: tab separated file with 6 columns:
        id, parent, label, description, count, color
    :param app: App object used for status updates
    """
    tree = {}
    to_process = []
    with open(file=file_name, mode="r", encoding="utf-8") as f_in:
        for line_idx, line in enumerate(f_in):
            if line_idx == 0:
                continue
            node_ids_unformatted, *line_data = line.rstrip("\n").split("\t")
            node_ids = node_ids_unformatted.split("|")
            for node_id in node_ids:
                parent = line_data[0]
                count = 0
                try:
                    count = int(line_data[3])
                except ValueError:
                    pass

                node = {
                    "id": node_id,
                    "parent": parent,
                    "level": 0,
                    "label": line_data[1],
                    "description": line_data[2],
                    "counts": count if count != 0 else zero,
                    "imported_counts": count if count != 0 else fake_one,
                    "color": line_data[4]
                }

                # populate first level of tree structure
                if not parent:
                    tree[node_id] = {
                        node_id: node
                    }
                else:
                    to_process.append([0, node])

    while True:
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
                    continue

            attempts += 1

        for idx in sorted(drop_idxs, reverse=True):
            del to_process[idx]

        if not to_process:
            break

    return tree


def get_human_phenotype_ontology(url: str = "https://purl.obolibrary.org/obo/hp.obo",
                                 root_id: str = "HP:0000118",
                                 app: object = None) -> dict:
    """Downloads and parses the HPO from a remote obo file

    :param url: url of hp.obo file
    :param root_id: ID of "Phenotypic abnormality" to mark starting-point for creation of sub-trees
    :param app: App object used for status updates
    """

    app.set_status("Downloading human phenotype ontology ..")
    response = requests.get(url=url, stream=False)
    response.raise_for_status()

    # Read the response content in chunks
    chunks = []
    for chunk in response.iter_content(chunk_size=128 * 512):
        app.set_status(f"Downloading human phenotype ontology .. "
                       f"{round(len(chunks) * 128 / 2048, 2)} MB")
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
                "def": None,
                "comment": None,
                "xrefs": [],
                "is_a": [],
            }
        elif line.startswith("id: "):
            new_entity["id"] = line.lstrip("id: ")
        elif line.startswith("name: "):
            new_entity["label"] = line.lstrip("name: ")
        elif line.startswith("def: "):
            new_entity["def"] = line.lstrip('def: "').split('" [')[0]
        elif line.startswith("comment: "):
            new_entity["comment"] = line.lstrip("comment: ")
        elif line.startswith("xref: "):
            new_entity["xrefs"].append(line.lstrip("xref: "))
        elif line.startswith("is_a: "):
            new_entity["is_a"].append(line.lstrip("is_a: ").split(" ! ")[0])
        elif line == "":
            raw_terms[new_entity["id"]] = new_entity

    # build first level
    tree = {}
    for term, val in raw_terms.items():
        if root_id in val["is_a"]:
            tree[term] = {}
            tree[term][term] = val
            tree[term][term]["level"] = 0
            tree[term][term]["parent"] = ""

    # propagate
    iterations = 0
    while True:
        had_content = False
        for sub_tree_id, sub_tree in tree.items():
            for term, val in raw_terms.items():
                for is_a in val["is_a"]:
                    if is_a in sub_tree.keys() and term not in sub_tree.keys():
                        sub_tree[term] = val
                        sub_tree[term]["level"] = sub_tree[is_a]["level"] + 1
                        sub_tree[term]["parent"] = sub_tree[is_a]["id"]
                        had_content = True
        if not had_content:
            break
        else:
            iterations += 1
            app.set_status(f"Building HPO tree .. iteration #{iterations}")

    # add parents for parent-less ids (idk where this happens)
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

    app.set_status(f"Parsed HPO ontology, removed nodes without parents")

    return tree


def sanitize_string(filename):
    # Define a regular expression pattern for illegal characters and newline
    illegal_chars_pattern = r'[<>:"/\\|?*\x00-\x1F\n]'

    # Replace illegal characters with an underscore
    sanitized_filename = re.sub(illegal_chars_pattern, '_', filename)

    return sanitized_filename
