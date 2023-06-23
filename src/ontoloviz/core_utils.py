from plotly.colors import hex_to_rgb, n_colors


def chunks(input_list, number_of_chunks):
    """Yield number_of_chunks number of striped chunks from input_list."""
    for i in range(0, number_of_chunks):
        yield input_list[i::number_of_chunks]


def rgb_to_hex(rgb: tuple = None) -> str:
    """Convert RGB to hex

    :param rgb: tuple in format (r, g, b) where r, g, b are integers in range [0-255]
    :return str: converted color as hex-string
    """
    # necessary due to weird behaviour introduced by plotly
    # test = plotly.colors.ncolors(lowcolor=(64, 60, 83), highcolor=(255, 0, 255), n_colors=11001)
    # print(test[-1])
    if any(False if 0 <= _ < 256 else True for _ in rgb):
        for idx, color in enumerate(rgb):
            if color < 0:
                tmp = list(rgb)
                tmp[idx] = 0
                print(f"Corrected color: {rgb} > {tuple(list(tmp))}")
                rgb = tuple(list(tmp))
    return f"#{int(rgb[0]):02X}{int(rgb[1]):02X}{int(rgb[2]):02X}"


def generate_color_range(start_color: str = None, stop_color: str = None,
                         values: int = None) -> list:
    """Calculate color range based on start and stop color and number of values

    :param start_color: start color as RGB hex
    :param stop_color: stop color as RGB hex
    :param values: number of colors to generate
    :return list: list of hex color codes
    """
    start_color = hex_to_rgb(start_color)
    stop_color = hex_to_rgb(stop_color)

    try:
        color_list = n_colors(start_color, stop_color, values)
        return [rgb_to_hex(_) for _ in color_list]
    except ZeroDivisionError:
        return [rgb_to_hex(start_color)]


def get_brightness(rgb_color: tuple = None) -> float:
    """
    Get the brightness of a rgb color triplet

    :param rgb_color: rgb color triplet
    :return: brightness as float
    """
    r, g, b = rgb_color
    brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness


def prioritize_bright_colors(color_list: list = None) -> list:
    """
    Filters a list of threshold-color-tuples (0.0, "#FFFFFF") and eliminates duplicates while
    prioritizing brighter colors over darker ones

    :param color_list: color list in the format [(0.0, "#585569"), (0.0, "#FEFEFE"), (0.1, ..), ..]
    :return: filtered color list in the format [(0.0, "#FEFEFE"), (0.1, ..), ..]
    """
    sorted_colors = {}
    for idx, color in color_list:
        brightness = get_brightness(hex_to_rgb(color))
        if idx not in sorted_colors or get_brightness(hex_to_rgb(sorted_colors[idx])) < brightness:
            sorted_colors[idx] = color

    return [(idx, color) for idx, color in sorted_colors.items()]
