from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

from .user import User          # noqa: E402,F401
from .analysis import Analysis  # noqa: E402,F401
