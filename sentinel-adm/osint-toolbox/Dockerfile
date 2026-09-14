# SENTINEL-ADM — optional OSINT toolbox.
# Maigret (username reconnaissance) and Holehe (email footprinting) run in this
# container, never in the API process: the API only prepares job specs, the
# toolbox executes them and writes the dossiers to the shared volume.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir maigret holehe
WORKDIR /dossiers
VOLUME ["/dossiers"]
CMD ["sleep", "infinity"]
