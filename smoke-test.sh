#!/usr/bin/env bash
set -u
cd /home/claude/Skyward/backend
python -m uvicorn main:app --port 8005 > /tmp/uv.log 2>&1 &
SRV=$!
# wait for it to listen
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://127.0.0.1:8005/api/health 2>/dev/null; then break; fi
  sleep 0.5
done
echo "=== health ===";       curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/api/health
echo "=== / ===";            curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/
echo "=== css ===";          curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/static/css/app.css
echo "=== config.js ===";    curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/static/js/config.js
echo "=== map.js ===";       curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/static/js/views/map.js
echo "=== library.json ==="; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/static/data/library.json
echo "=== /webcams spa ==="; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/webcams
echo "=== /library spa ==="; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/library
echo "=== /forecast spa ==="; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/forecast
echo "=== forecast.js ==="; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/static/js/views/forecast.js
echo "=== /api/mwis bad area (404) ==="; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8005/api/mwis?area=atlantis"
echo "=== weather (Ben Nevis 56.80,-5.00) ==="
curl -s "http://127.0.0.1:8005/api/weather?lat=56.80&lon=-5.00" | python -c "import sys,json; d=json.load(sys.stdin); c=d['raw']['current']; print('oceanic:', d['oceanic'], '| temp:', c['temperature_2m'], 'C | wind:', c['wind_speed_10m'], 'mph | source:', d['source'], '| attribution:', d['attribution']['name'])"
echo "=== weather (mid-Atlantic 45.0,-30.0) ==="
curl -s "http://127.0.0.1:8005/api/weather?lat=45.0&lon=-30.0" | python -c "import sys,json; d=json.load(sys.stdin); print('oceanic flag:', d.get('oceanic'))"
echo "=== bad coords (lat 200) ==="
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8005/api/weather?lat=200&lon=0"
kill $SRV 2>/dev/null
wait $SRV 2>/dev/null
echo "=== done ==="
