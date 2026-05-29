# WiFi CSI Telemetry Research Lab

**Live project site:** https://mandozone.github.io/WiFi-DensePose-Through-Wall-Human-Detection/

WiFi CSI Telemetry Research Lab is a research-style lab exploring passive human presence and movement sensing using WiFi Channel State Information (CSI). The project uses a Dockerized RuView environment on Kali Linux to run a local dashboard, simulate sensing data, and prepare for future ESP32-based CSI capture.

> Current status: **Phase 1 operational in simulation mode.** The Docker backend and dashboard are running locally. Hardware CSI capture, through-wall validation, and vital-sign validation are planned next steps.

## Recruiter Summary

| Area | Details |
|---|---|
| **Project type** | Wireless sensing, infrastructure lab, Docker deployment, RF/security research |
| **What I built** | Kali Linux VM setup, Dockerized RuView CSI telemetry server, local dashboard, simulation-mode sensing workflow, hardware roadmap |
| **Evidence** | Docker logs, dashboard screenshots, network verification, sensing visualization, ESP32-S3 hardware procurement |
| **Security relevance** | Demonstrates infrastructure troubleshooting, wireless/RF awareness, privacy-sensitive technology evaluation, and staged lab documentation |

## Architecture

```text
Alfa AWUS036AC transmitter
        |
        | WiFi sensing traffic
        v
Human body affects signal path through absorption, reflection, diffraction, and scattering
        |
        v
ESP32-S2 / ESP32-S3 receivers capture CSI
        |
        | WebSocket 3001 / UDP 5005
        v
Kali Linux VM + Docker
        |
        v
Rust/Axum RuView backend + local dashboard on port 3000
```

## CSI vs RSSI

RSSI is a single coarse signal-strength value. CSI is lower-level channel data that can include amplitude and phase changes across subcarriers. That makes CSI more useful for motion and presence research because it exposes small signal variations caused by movement, multipath interference, and body-position changes.

## Hardware Status

| Component | Purpose | Status |
|---|---|---|
| Alfa AWUS036AC | WiFi transmitter / packet injection adapter | Owned |
| ESP32-S2 DevKit | CSI receiver testing | Owned |
| 2x ESP32-S3 DevKitC-1 | Multi-receiver triangulation | Ordered |
| Kali Linux VM | Processing environment | Running |

## Software Stack

- Kali Linux 2025.2
- VirtualBox
- Docker and docker-compose
- `ruvnet/wifi-densepose:latest`
- Rust/Axum backend
- WebSocket `3001`
- UDP `5005`
- Local UI: `http://localhost:3000/ui/index.html`

## Commands

```bash
docker pull ruvnet/wifi-densepose:latest

docker run -d --name ruview \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 5005:5005/udp \
  -e CSI_SOURCE=auto \
  ruvnet/wifi-densepose:latest

docker logs ruview -f
curl -s http://localhost:3000/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ui/index.html
ss -tlnp | grep -E "3000|3001"
```

## Troubleshooting Log

| Issue | Cause | Fix |
|---|---|---|
| DNS resolution failure | VirtualBox NAT DNS issue | Set resolver to `8.8.8.8` |
| `docker-compose` missing | Not installed by default on Kali | Installed with `sudo apt install -y docker-compose` |
| Frontend 404 | Stale Docker image missing UI files | Pulled fresh `ruvnet/wifi-densepose:latest` |
| Multi-line Docker command failed | Shell line-continuation parsing | Used single-line command / full block paste |

## Evidence Screenshots

The `site/assets/` folder contains upright optimized screenshots showing:

- ESP32-S3 receiver hardware procurement
- Local WiFi CSI Telemetry Research Lab dashboard
- Docker container logs and server status
- docker-compose environment setup
- Network verification and packet tests
- Simulation heatmap / sensing visualization
- `PRESENT_MOVING` classification screen

## Roadmap

| Phase | Status | Work |
|---|---|---|
| Infrastructure setup | Complete | Kali VM, Docker, RuView image, dashboard |
| Hardware procurement | In progress | ESP32-S3 boards ordered |
| Firmware and CSI capture | Pending | Flash ESP32 firmware and stream CSI to server |
| Calibration | Pending | Sensor placement, room mapping, model tuning |
| Through-wall validation | Pending | Authorized lab testing only |

## Ethics and Privacy

This is privacy-sensitive technology. This project is documented as an authorized lab and research build. It should only be tested in controlled environments where all participants understand the sensing setup and consent to testing.

## Skills Demonstrated

`Kali Linux` · `Docker` · `Wireless Security` · `WiFi CSI` · `RF Sensing` · `ESP32` · `VirtualBox` · `Troubleshooting` · `Technical Documentation` · `Privacy-Aware Security Research`

