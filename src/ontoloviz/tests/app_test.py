import plotly

from ontoloviz.core import rgb_to_hex, chunks, generate_color_range, SunburstBase, PhenotypeSunburst, DrugSunburst
from ontoloviz.app import App, BorderPopup, ExportPopup, ColorScalePopup
from time import sleep
from threading import Thread


def test_rgb_to_hex():
	assert rgb_to_hex(rgb=(255, 255, 255)) == "#FFFFFF"


def test_rgb_to_hex_negative_rgb_value():
	color_array = plotly.colors.n_colors(lowcolor=(64, 60, 83), highcolor=(255, 0, 255), n_colors=11001)
	negative_rgb_tuple = color_array[-1]
	assert rgb_to_hex(rgb=negative_rgb_tuple) == "#FE00FF"


def test_generate_color_range():
	assert generate_color_range(
		start_color="#000000", stop_color="#FF0000", values=3) == ["#000000", "#7F0000", "#FF0000"]


def test_chunking():
	assert len([_ for _ in chunks(input_list=[_ for _ in range(505)], number_of_chunks=10)]) == 10


def test_sunburst_class_inits():
	assert isinstance(SunburstBase(), SunburstBase)
	assert isinstance(PhenotypeSunburst(), PhenotypeSunburst)
	assert isinstance(DrugSunburst(), DrugSunburst)


def test_drug_sunburst_attributes():
	drug_sunburst = DrugSunburst()
	assert hasattr(drug_sunburst, "atc_tree")
	assert not drug_sunburst.is_init
	drug_sunburst.init()
	assert drug_sunburst.is_init


def auto_close_ui_thread(app_instance: App):
	sleep_timer = 0
	while sleep_timer < 3:
		sleep(1)
		print(f"Sleeping for {3-sleep_timer} s before destroying app")
		sleep_timer += 1
	app_instance.destroy()
	app_instance.quit()
	del app_instance


def test_ui():
	app = App()

	app_auto_close = Thread(target=auto_close_ui_thread, args=[app], daemon=True)
	app_auto_close.start()
	Thread(target=BorderPopup, args=[app], daemon=True).start()
	Thread(target=ExportPopup, args=[app], daemon=True).start()
	Thread(target=ColorScalePopup, args=[app], daemon=True).start()
	app.mainloop()
