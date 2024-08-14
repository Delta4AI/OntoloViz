from time import sleep
from threading import Thread

import tkinter
import plotly

from src.ontoloviz.core_utils import rgb_to_hex, chunks, generate_color_range
from src.ontoloviz.core import SunburstBase, MeSHSunburst, ATCSunburst
from src.ontoloviz.app import App, BorderPopup, ExportPopup, ColorScalePopup


def test_rgb_to_hex():
    """Test utility function rgb_to_hex"""
    assert rgb_to_hex(rgb=(255, 255, 255)) == "#FFFFFF"


def test_rgb_to_hex_negative_rgb_value():
    """Test utility function rgb_to_hex when error-prone array is passed"""
    color_array = plotly.colors.n_colors(lowcolor=(64, 60, 83), highcolor=(255, 0, 255),
                                         n_colors=11001)
    negative_rgb_tuple = color_array[-1]
    assert rgb_to_hex(rgb=negative_rgb_tuple) == "#FE00FF"


def test_generate_color_range():
    """Test utility function generate_color_scale"""
    assert generate_color_range(
        start_color="#000000", stop_color="#FF0000", values=3) == ["#000000", "#7F0000", "#FF0000"]


def test_chunking():
    """Test utility function chunks"""
    assert len(list(chunks(input_list=list(range(505)), number_of_chunks=10))) == 10


def test_sunburst_class_inits():
    """Test SunburstBase and child classes"""
    assert isinstance(SunburstBase(), SunburstBase)
    assert isinstance(MeSHSunburst(), MeSHSunburst)
    assert isinstance(ATCSunburst(), ATCSunburst)


def test_drug_sunburst_attributes():
    """Test ATCSunburst class"""
    drug_sunburst = ATCSunburst()
    assert hasattr(drug_sunburst, "atc_tree")
    assert not drug_sunburst.is_init
    drug_sunburst.init()
    assert drug_sunburst.is_init


def auto_close_ui_thread(app_instance: App):
    """Thread to stop tkinter mainloop after 3 seconds"""
    sleep_timer = 0
    while sleep_timer < 3:
        sleep(1)
        print(f"Sleeping for {3 - sleep_timer} s before destroying app")
        sleep_timer += 1
    app_instance.destroy()
    app_instance.quit()


def test_ui():
    """Test visual components"""
    try:
        app = App()

        app_auto_close = Thread(target=auto_close_ui_thread, args=[app], daemon=True)
        app_auto_close.start()
        Thread(target=BorderPopup, args=[app], daemon=True).start()
        Thread(target=ExportPopup, args=[app], daemon=True).start()
        Thread(target=ColorScalePopup, args=[app], daemon=True).start()
        app.mainloop()
    except tkinter.TclError:
        print("No Window provider available - unable to test UI")
        assert True
