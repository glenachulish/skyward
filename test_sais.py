"""Tests for /api/sais — httpx mocked (sais.gov.uk unreachable from sandbox).
Synthetic HTML modelled on the real page structure fetched 2026-06-09."""
import datetime
import sys
sys.path.insert(0, "/home/claude/skyward/backend")

import main
from fastapi.testclient import TestClient

client = TestClient(main.app)
TODAY = datetime.date.today().strftime("%d/%m/%Y")

HOME_IN_SEASON = f"""
<html><body>
<nav><a>Lochaber</a><a>Glencoe</a><a>Torridon</a><a>Creag Meagaidh</a>
<a>Northern Cairngorms</a><a>Southern Cairngorms</a></nav>
<h1>Avalanche Information for the Scottish Mountains</h1>
<h3>Area Hazard Summaries</h3>
<h4>Creag Meagaidh</h4>
<p>Low - Human triggered avalanches are generally only possible from high additional loads.</p>
<p>Published: {TODAY}</p>
<h4>Glencoe</h4>
<p>Considerable - Natural avalanches may occur, in some cases large.</p>
<p>Published: {TODAY}</p>
<h4>Lochaber</h4>
<p>Moderate - Human triggered avalanches are possible, good visibility and route selection important.</p>
<p>Published: {TODAY}</p>
<h4>Northern Cairngorms</h4>
<p>High - Natural avalanches will occur with numerous large avalanches expected.</p>
<p>Published: {TODAY}</p>
<h4>Southern Cairngorms</h4>
<p>Low - Human triggered avalanches are generally only possible from high additional loads.</p>
<p>Published: {TODAY}</p>
<h4>Torridon</h4>
<p>Very High - Widespread natural avalanche activity expected.</p>
<p>Published: {TODAY}</p>
</body></html>
"""

HOME_OUT_OF_SEASON = """
<html><body>
<p>We have now finished issuing avalanche reports for the winter.</p>
<h4>Creag Meagaidh</h4><p>Low - Human triggered avalanches are generally only possible.</p><p>Published: 24/02/2026</p>
<h4>Glencoe</h4><p>Low - Human triggered avalanches are generally only possible.</p><p>Published: 24/02/2026</p>
<h4>Lochaber</h4><p>Moderate - Human triggered avalanches are possible.</p><p>Published: 24/02/2026</p>
<h4>Northern Cairngorms</h4><p>No hazard category issued</p>
<h4>Southern Cairngorms</h4><p>No hazard category issued</p>
<h4>Torridon</h4><p>No hazard category issued</p>
</body></html>
"""

REGION_DETAIL = """
<html><body>
<h1>Avalanche Report for Lochaber</h1>
<p>FOR PERIOD 18:00 Tue 06/01/2026 TO 18:00 Wed 07/01/2026</p>
<p>The avalanche hazard will be Considerable</p>
<h3>Avalanche Problems</h3><p>Windslab stuff.</p>
<h3>Forecast Snow Stability &amp; Avalanche Hazard</h3>
<p>Unstable windslab will initially be present mainly on North to East aspects above 900 metres.</p>
<h3>Forecast Weather Influences</h3>
<p>Showers overnight will fall as snow to low levels.</p>
<h3>Comments</h3>
<p>Looking like cold conditions for the rest of the week.</p>
<h3>Observed Avalanche Hazard</h3><p>The avalanche hazard is Considerable</p>
</body></html>
"""

REGION_FINISHED = """
<html><body>
<h1>Avalanche Report for Glencoe</h1>
<p>Reports for Glencoe have now finished for the winter</p>
</body></html>
"""


class FakeResponse:
    def __init__(self, text, status=200):
        self.text = text
        self.status_code = status
    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx
            raise httpx.HTTPStatusError("err", request=None, response=None)


def make_client(text, counter=None, fail=False):
    class FakeClient:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url, params=None):
            if counter is not None:
                counter.append(url)
            if fail:
                import httpx
                raise httpx.ConnectError("boom")
            return FakeResponse(text)
    return FakeClient


def run():
    import httpx  # noqa

    # 1. In-season summary
    main._sais_cache.clear()
    calls = []
    main.httpx.AsyncClient = make_client(HOME_IN_SEASON, calls)
    r = client.get("/api/sais").json()
    assert r["parsed"] is True, r
    assert r["in_season"] is True, r
    by = {x["id"]: x for x in r["regions"]}
    assert by["lochaber"]["hazard"] == "Moderate" and by["lochaber"]["level"] == 2
    assert by["glencoe"]["level"] == 3
    assert by["northern-cairngorms"]["level"] == 4
    assert by["torridon"]["hazard"] == "Very High" and by["torridon"]["level"] == 5
    assert by["creag-meagaidh"]["level"] == 1
    assert by["lochaber"]["published"] == TODAY
    assert "avalanches are possible" in by["lochaber"]["description"]
    print("PASS in-season summary (nav-menu noise ignored, all 6 levels correct)")

    # 2. Cache: second call, no new fetch
    n = len(calls)
    r2 = client.get("/api/sais").json()
    assert len(calls) == n and r2 == r
    print("PASS summary served from cache")

    # 3. Out-of-season summary
    main._sais_cache.clear()
    main.httpx.AsyncClient = make_client(HOME_OUT_OF_SEASON)
    r = client.get("/api/sais").json()
    assert r["parsed"] is True
    assert r["in_season"] is False, r
    by = {x["id"]: x for x in r["regions"]}
    assert by["lochaber"]["hazard"] == "Moderate"          # last-published still surfaced
    assert by["torridon"]["hazard"] is None                # no category issued
    print("PASS out-of-season summary (finished message + stale dates -> in_season false)")

    # 4. Region detail
    main._sais_cache.clear()
    main.httpx.AsyncClient = make_client(REGION_DETAIL)
    r = client.get("/api/sais", params={"region": "lochaber"}).json()
    assert r["parsed"] is True and r["in_season"] is True
    f = r["forecast"]
    assert f["hazard"] == "Considerable" and f["level"] == 3
    assert "18:00 Tue 06/01/2026" in f["period"]
    assert f["stability"].startswith("Unstable windslab")
    assert "Showers overnight" in f["weather"]
    assert "cold conditions" in f["comments"]
    # the Observed section must NOT bleed into the forecast stability text
    assert "hazard is Considerable" not in f["stability"]
    print("PASS region detail (period/hazard/stability/weather/comments; no section bleed)")

    # 5. Region finished for the season
    main._sais_cache.clear()
    main.httpx.AsyncClient = make_client(REGION_FINISHED)
    r = client.get("/api/sais", params={"region": "glencoe"}).json()
    assert r["parsed"] is True and r["in_season"] is False
    print("PASS region out-of-season")

    # 6. Unknown region
    assert client.get("/api/sais", params={"region": "nonsense"}).status_code == 404
    print("PASS unknown region -> 404")

    # 7. Network failure -> soft fallback
    main._sais_cache.clear()
    main.httpx.AsyncClient = make_client("", fail=True)
    r = client.get("/api/sais").json()
    assert r["parsed"] is False and "error" in r
    print("PASS network failure -> parsed:false fallback")

    print("\nALL SAIS TESTS PASSED")


if __name__ == "__main__":
    run()
