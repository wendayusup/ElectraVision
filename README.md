# ElectraVision AI - Pemindai Komponen Elektronika

<div align="center">

![ElectraVision Banner](https://img.shields.io/badge/YOLO11-Ultralytics-blue?style=for-the-badge&logo=yolo)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

<p align="center">
  <strong>Aplikasi cerdas berbasis Computer Vision (YOLO) dan FastAPI untuk memindai, mengenali, dan menampilkan panduan teknis serta rekomendasi ide proyek komponen elektronika secara real-time.</strong>
</p>

</div>

---

## Fitur Utama

- **Deteksi Real-Time Kamera**: Menggunakan webcam perangkat secara langsung dengan bounding box akurat, aksen pemindai cerdas, dan indikator FPS / resolusi.
- **Model Deep Learning YOLO11s**: Model berkecepatan tinggi (~30 FPS / ~32ms latensi inferensi di CPU) yang mengenali **58 jenis komponen elektronika**.
- **Informasi Teknis Komprehensif**:
  - **Nama dan Kategori Komponen**
  - **Fungsi Kerja Komponen**
  - **Daftar Pinout / Terminal Lengkap**
  - **Panduan Menghubungkan Rangkaian**
  - **Peringatan Keselamatan dan Batas Kerja**
- **Rekomendasi Ide Proyek Cerdas**: Menyajikan rekomendasi proyek DIY / IoT yang dapat dibuat berdasarkan komponen yang sedang terdeteksi di depan kamera.
- **Antarmuka Modern dan Responsif**: Mengusung desain *midnight circuit glassmorphism* bertema elektronika dengan tipografi Poppins dan transisi adaptif.

---

## Daftar 58 Komponen yang Dikenali

Aplikasi ini mampu mendeteksi 58 komponen elektronika yang mencakup:

| Kategori | Komponen yang Didukung |
| :--- | :--- |
| **Mikrokontroler dan Modul Dev** | Arduino Uno, Arduino Mega, ESP32, ESP32-CAM |
| **Komunikasi dan Interface** | Modul Bluetooth, Modul GSM, Modul FT232 USB-Serial, RFID Scanner |
| **Sensor Lingkungan dan Jarak** | Sensor LDR, Sensor IR, Sensor Suara / Sonar (Ultrasonik), Sensor Suhu (NTC Thermistor), Sensor Kelembaban dan Tanah, Sensor Hujan, Sensor Gas, Sensor Air, TCRT5000, Motion Sensor (PIR) |
| **Aktuator dan Penggerak** | Motor DC, Servo Motor, Driver Motor, Buzzer, Relay Module |
| **Tampilan / Display** | Layar LCD, Layar OLED, 7-Segment Display |
| **Komponen Pasif dan Diskrit** | Resistor, Potensiometer (Taper dan Trimmer), Kapasitor (10uF, 470uF, Keramik, Film, MLC), Induktor |
| **Semikonduktor Daya dan Saklar** | Dioda, Dioda Zener, Bridge Rectifier, Transistor BJT, MOSFET, IGBT, IC Chip, IC Base (14 dan 28 Pin) |
| **Catu Daya dan Proteksi** | Baterai 3,3V, Buck Converter, Sekring (Fuse), Fuse Base, Heat Sink, LED Light, Saklar (Push, Tact, Rocker) |

---

## Panduan Instalasi dan Menjalankan

### 1. Kloning Repositori
```bash
git clone https://github.com/wendayusup/ElectraVision.git
cd ElectraVision
```

### 2. Siapkan Python Virtual Environment (Disarankan)
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### 3. Instal Dependensi
```bash
pip install -r requirements.txt
```

### 4. Pastikan File Model Tersedia
Pastikan file bobot model berada di direktori `model/my_model.pt`.

### 5. Jalankan Server Aplikasi
```bash
python main.py
```
Atau menggunakan uvicorn langsung:
```bash
uvicorn main:app --reload
```

### 6. Buka Antarmuka Web
Buka browser dan akses alamat berikut:
```text
http://127.0.0.1:8000
```
> **Catatan Izin Kamera**: Pastikan browser mengizinkan akses ke webcam perangkat Anda.

---

## Struktur Proyek

```text
deteksi-komponen-web/
|-- data/
|   |-- components.json          # Basis data teknis, pinout, dan fungsi 58 komponen
|   `-- project_ideas.json       # Rekomendasi ide proyek per komponen
|-- model/
|   `-- my_model.pt              # Bobot model YOLO11s terlatih
|-- static/
|   |-- css/
|   |   `-- style.css            # Desain antarmuka Glassmorphism
|   `-- js/
|       `-- main.js              # Logika streaming kamera, inferensi, dan UI interaktif
|-- templates/
|   `-- index.html               # Halaman utama aplikasi
|-- main.py                      # Server backend FastAPI dan API Endpoint
|-- requirements.txt             # Daftar dependensi Python
`-- README.md                    # Dokumentasi proyek
```

---

## REST API Endpoints

Aplikasi ini juga menyediakan REST API yang dapat digunakan untuk integrasi sistem lain:

| Endpoint | Method | Deskripsi |
| :--- | :---: | :--- |
| `/` | `GET` | Menampilkan antarmuka pemindai web |
| `/api/model-status` | `GET` | Memeriksa ketersediaan model dan daftar kelas aktif |
| `/api/components` | `GET` | Mengambil seluruh data komponen dari basis data |
| `/api/components/{id}` | `GET` | Mengambil detail spesifik dan rekomendasi proyek komponen |
| `/detect` | `POST` | Mengirim gambar (`multipart/form-data`) untuk dipindai oleh model |

---

## Kontributor

- **Wenda Yusup** ([@wendayusup](https://github.com/wendayusup))

---

## Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).
