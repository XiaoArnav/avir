import re
import sys
from playwright.sync_api import expect, sync_playwright


def verify(page, url):
    page.route("https://*.open-meteo.com/**", lambda route: route.abort())
    page.goto(url, wait_until="domcontentloaded")
    daily_plan = page.get_by_role("tab", name=re.compile("Daily Plan"))
    daily_plan.click()
    add = page.get_by_role("button", name="Add Activity")
    add.click()
    editor = page.get_by_role("dialog", name="Add New Activity")
    expect(editor.get_by_role("button", name="Close activity editor")).to_be_focused()
    page.keyboard.press("Escape")
    expect(add).to_be_focused()
    add.click()
    editor.get_by_label("Activity Name").fill("Evening walk")
    editor.get_by_label("Start Time (24h)", exact=False).fill("22:30")
    editor.get_by_label("End Time (24h)", exact=False).fill("23:00")
    editor.get_by_role("button", name="Save Activity").click()
    expect(editor).to_have_count(0)
    page.get_by_role("button", name="Optimize with Forecast").click()
    expect(page.get_by_text("Hourly forecast unavailable. Your routine is saved.")).to_be_visible()
    page.reload(wait_until="domcontentloaded")
    daily_plan.click()
    expect(page.get_by_text("Evening walk", exact=True)).to_be_visible()


if __name__ == "__main__":
    with sync_playwright() as runner:
        browser = runner.chromium.launch(channel="chromium")
        for width in (375, 768, 1280):
            page = browser.new_page(viewport={"width": width, "height": 850})
            verify(page, sys.argv[1])
            page.close()
        browser.close()
