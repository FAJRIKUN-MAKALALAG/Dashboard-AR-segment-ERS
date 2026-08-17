# Laporan Proyek: Account Receivable (AR) Dashboard

**Project Brief & Analisis Fungsional**
**Versi:** 1.0 | **Tanggal:** 16 Agustus 2026

## 1. Executive Summary

Project ini bertujuan mengubah proses monitoring _Account Receivable_ (AR) yang saat ini masih bergantung pada Excel, _filter_ manual, _Pivot Table_, dan penyusunan dashboard presentasi secara manual menjadi sebuah web dashboard yang terintegrasi dan otomatis. Target utamanya adalah memastikan setiap perubahan data _Open Item_ langsung memperbarui seluruh KPI, _aging_, status invoice, _flow_ AR, _action plan_, dan detail akun secara otomatis.

## 2. Project Goals & Success Criteria

- **Otomatisasi Segmen:** Mengotomatisasi pengelompokan data berdasarkan lima segmen PENGELOLAAN.

- **Efisiensi:** Menghilangkan filter Excel dan _Pivot Table_ manual untuk kebutuhan dashboard rutin.

- **Fungsi Ganda:** Menjadikan dashboard sebagai sumber monitoring sekaligus bahan presentasi manajemen.

- **Detailing & History:** Menyediakan fitur _drill-down_ dari _executive summary_ hingga detail pelanggan, serta _historical view_ berdasarkan _snapshot_ bulanan.

- **Indikator Keberhasilan:** User dapat mengetahui total AR dalam beberapa detik, perubahan filter langsung memperbarui dashboard, dan proses presentasi manual dapat tergantikan.

## 3. Background & Workflow

### 3.1 Sumber Data

Sumber utama monitoring adalah _Open Item Online Excel_ atau _file snapshot_ bulanan (contoh periode referensi: OI 202606, OI 202607, dan OI 202608). Sistem memerlukan _importer_ yang membaca berdasarkan nama _header_ (bukan posisi kolom tetap) karena struktur kolom dapat bergeser antar periode.

### 3.2 Perbandingan Alur Kerja (AS-IS vs TO-BE)

- **AS-IS (Saat Ini):** User membuka file Excel, memilih periode, memfilter kolom PENGELOLAAN satu per satu, membuat/refresh _Pivot Table_, menyalin hasilnya secara manual ke dashboard presentasi, dan mengulang seluruh proses jika data berubah.

- **TO-BE (Target):** Data Open Item diperbarui/masuk, sistem mendeteksi periode dan _header_, data dikelompokkan otomatis, _business rules_ dijalankan, KPI dihitung ulang, dan dashboard web langsung tersaji untuk dianalisis dan dipresentasikan.

## 4. Segmentasi & Struktur Data

- **Segmentasi PENGELOLAAN:** Meliputi 5 kategori utama, yaitu **SBS**, **MIS**, **TWS**, **FRBS**, dan **ERS**.

- **Kelompok Data Terkait:** Meliputi informasi identitas akun (BP Num, Account Num, Name, NIPNAS), pemetaan wilayah/area (Reg, Area, Witel, Satker), hingga nilai finansial seperti Total Sum of Loc Amount, Total Sudah/Belum Bayar, Total Sudah Invoice, Total Kontrak, BAST/BAPP, Rekon/SLG, Termin, dan Proses Identifikasi.

## 5. Arsitektur Informasi & Pertanyaan Inti

Dashboard dirancang untuk menjawab lima pertanyaan utama manajemen secara cepat:

1. Berapa total AR saat ini?

2. Segmen mana yang memiliki AR terbesar?

3. Berapa nilai AR yang layak dan tidak layak ditagih?

4. Pada tahap mana posisi AR tersebut saat ini?

5. Siapa penanggung jawab (_PIC/UIC_), apa tindak lanjutnya, dan kapan tenggat waktunya (_due date_)?

Lapisan informasi dalam sistem mencakup ringkasan eksekutif (_executive_), analisis distribusi (_analysis_), posisi proses AR (_flow_), rencana tindak lanjut (_execution_), detail data akun (_detail_), serta perbandingan tren historis (_history_).

## 6. Persyaratan Fungsional (_Functional Requirements_)

- **FR-01 hingga FR-03:** Pengguna dapat memfilter data berdasarkan periode _snapshot_, segmen (ALL/SBS/MIS/TWS/FRBS/ERS), dan region.

- **FR-04:** _Cross-filtering_ di mana seluruh KPI, grafik, dan tabel menyesuaikan filter aktif.

- **FR-05 hingga FR-07:** Fitur _drill-down_ interaktif pada KPI, _flow_ AR, dan _bucket aging_ untuk melihat akun kontributor.

- **FR-08 & FR-09:** Pencarian data pelanggan dan monitoring aksi penagihan (_action_, _PIC/UIC_, _due date_, _status_).

- **FR-10 hingga FR-12:** Tren historis bulanan, fungsi ekspor data sesuai filter, serta mekanisme pembaruan/unggah data dengan pencatatan waktu pembaruan terakhir.

## 7. Batasan Aturan Bisnis (_Business Rule Boundary_)

Formula final dan aturan perhitungan untuk kategori seperti AR Layak/Tidak Layak Tagih, pemetaan wilayah Jakarta/Regional, status Invoiced/Belum Invoiced, hingga tahapan dokumen (Kontrak, BAST/BAPP, Rekon/SLG, Termin, Proses Identifikasi) memerlukan validasi terpisah dengan pemilik bisnis sebelum diterapkan secara penuh pada _backend_.

## 8. Cakupan MVP & Langkah Selanjutnya

- **Lingkup MVP:** Mencakup dashboard _overview_, filter periode/segmen/region, KPI eksekutif, grafik _aging_, _receivable flow_, rincian status _invoice_, tabel _action plan_, detail akun, tren historis sederhana, serta indikator pembaruan data.

- **Langkah Berikutnya:**

1. Menyetujui struktur analitis proyek.

2. Mendokumentasikan aturan kalkulasi di balik setiap komponen metrik.

3. Merancang skema basis data yang dinormalisasi beserta alur impor data.

4. Menghubungkan komponen sistem ke _backend/API_ setelah aturan bisnis divalidasi.

5. Melakukan pengujian menggunakan _snapshot_ historis dan mempersiapkan sinkronisasi langsung dengan _Open Item Online_.
