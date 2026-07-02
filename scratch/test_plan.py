import requests
import json

url = "http://127.0.0.1:8000/api/plan"
payload = {
    "city": "manali",
    "people": 3,
    "days": 5,
    "budget": 50000.0
}

print("Sending POST request to /api/plan...")
try:
    response = requests.post(url, json=payload, timeout=10)
    print(f"Status Code: {response.status_code}")
    print("Response JSON/Text:")
    try:
        print(json.dumps(response.json(), indent=2))
    except Exception:
        print(response.text)
except Exception as e:
    print(f"Request failed: {e}")
