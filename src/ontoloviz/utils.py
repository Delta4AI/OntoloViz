from datetime import datetime
import requests


def get_human_phenotype_ontology(url: str = "https://purl.obolibrary.org/obo/hp.obo",
                                 root_id: str = "HP:0000118") -> dict:
    """Parses the HPO from an obo file"""

    response = requests.get(url=url, stream=False)
    response.raise_for_status()

    # Read the response content in chunks
    chunks = []
    for chunk in response.iter_content(chunk_size=1024):
        chunks.append(chunk.decode("utf-8"))

    # Concatenate the chunks into a single string
    text = ''.join(chunks).split("\n")

    # remove header block
    text = text[text.index("")+1:]

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
            print(f"Starting iteration #{iterations}")

    # add zero counts
    for sub_tree in tree.values():
        for node in sub_tree.values():
            node["imported_counts"] = 1.000001337
            node["counts"] = 0.000001337
            node["color"] = "#FFFFFF"
            node["description"] = f"Definition: {node['def']}\nComment: {node['comment']}",

    print("Parsed HP ontology")
    return tree
