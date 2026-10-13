"""Aircast's tiny static shell.

Camera access and hand tracking intentionally live in the browser. Keeping the
server out of that loop makes the app work without Python camera dependencies.
"""

from flask import Flask, render_template

app = Flask(__name__)


@app.after_request
def disable_stale_browser_cache(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=False, host="127.0.0.1", port=5000)
