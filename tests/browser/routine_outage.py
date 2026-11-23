import re
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
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
    editor.get_by_label("Earliest Allowed").fill("07:30")
    editor.get_by_label("Latest Allowed").fill("08:00")
    editor.get_by_role("button", name="Save Activity").click()
    expect(editor).to_have_count(0)
    page.get_by_role("button", name="Optimize with Forecast").click()
    expect(page.get_by_text("Hourly forecast unavailable. Your routine is saved.")).to_be_visible()
    page.reload(wait_until="domcontentloaded")
    daily_plan.click()
    expect(page.get_by_text("Evening walk", exact=True)).to_be_visible()

    day = (datetime.now(ZoneInfo("Asia/Kolkata")) + timedelta(days=1)).date().isoformat()
    times = [f"{day}T{h:02d}:00" for h in range(24)]
    def restore_provider(route):
        air = "air-quality-api" in route.request.url
        hourly = {"pm2_5": [10 if h in (6, 7) else 100 for h in range(24)]} if air else {"boundary_layer_height": [500] * 24}
        current = {"pm2_5": 100, "pm10": 120, "us_aqi": 160} if air else {"temperature_2m": 20}
        route.fulfill(json={"timezone": "Asia/Kolkata", "current": {"time": times[0], **current},
                            "hourly": {"time": times, **hourly}})
    page.unroute("https://*.open-meteo.com/**")
    page.route("https://*.open-meteo.com/**", restore_provider)
    page.reload(wait_until="domcontentloaded")
    page.get_by_role("button", name="Connect My Monitor").wait_for(state="attached", timeout=45000)
    daily_plan.click()
    with page.expect_response(lambda r: r.url.endswith("/api/ai/plan")) as request:
        page.get_by_role("button", name="Optimize with Forecast").click()
    response = request.value
    assert response.ok
    assert "profile" not in response.request.post_data_json
    assert response.request.post_data_json["generalizedSensitivity"] == "standard"
    shifts = response.json()["deterministicPlan"]["activityShifts"]
    walk = next(s for s in shifts if s["activityName"] == "Evening walk")
    assert (walk["proposedStart"], walk["proposedEnd"]) == ("07:30", "08:00")
    activity = page.get_by_role("group", name="Evening walk", exact=True)
    activity.get_by_role("button", name="Accept Shift").click()
    page.reload(wait_until="domcontentloaded")
    daily_plan.click()
    expect(activity).to_contain_text("07:30 - 08:00")


if __name__ == "__main__":
    with sync_playwright() as runner:
        browser = runner.chromium.launch(channel="chromium")
        for width in (375, 768, 1280):
            page = browser.new_page(viewport={"width": width, "height": 850})
            verify(page, sys.argv[1])
            page.close()
        browser.close()
