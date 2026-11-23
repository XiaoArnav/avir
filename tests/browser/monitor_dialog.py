import sys
from playwright.sync_api import expect, sync_playwright


def verify(page, url, width):
    page.set_viewport_size({"width": width, "height": 850})
    page.goto(url, wait_until="domcontentloaded")
    trigger = page.get_by_role("button", name="Connect My Monitor")
    trigger.click(timeout=45000)
    dialog = page.get_by_role("dialog", name="Connect Hardware Air Monitor")
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role("button", name="Close dialog")).to_be_focused()
    page.keyboard.press("Escape")
    expect(dialog).to_have_count(0)
    expect(trigger).to_be_focused()
    assert page.evaluate("document.documentElement.scrollWidth") <= width


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chromium")
        for width in (375, 768, 1280):
            page = browser.new_page()
            verify(page, sys.argv[1], width)
            page.close()
        browser.close()
