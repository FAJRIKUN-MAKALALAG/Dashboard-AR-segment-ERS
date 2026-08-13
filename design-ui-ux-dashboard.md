# Design UI/UX Dashboard

Dokumen ini merangkum fitur UI/UX utama yang sudah dipakai pada project `AR-Segmen-ERS-dashboard`.

## 1. Arah Visual

- Tema visual menggunakan light cream background dengan kartu putih, border lembut, dan shadow tipis.
- Warna utama adalah:
  - `emerald` untuk status aktif, koneksi, dan aksi utama.
  - `blue` untuk refresh, analitik, dan informasi umum.
  - `amber` untuk warning atau kondisi kritis.
  - `rose` untuk error atau koneksi gagal.
- Tipografi memakai kombinasi `Poppins` dan `font-mono` untuk angka, status teknis, dan metadata.
- Background body dibuat bersih dan tenang, dengan aksen grid pattern halus untuk nuansa dashboard modern.

## 2. Struktur Layout

- Layout utama memakai container lebar maksimum `max-w-7xl` agar tetap fokus di desktop.
- Padding responsif diterapkan dengan `p-3 sm:p-6`.
- Susunan halaman dibagi menjadi:
  - header KPI
  - banner status/error
  - navigasi tab
  - isi tab aktif
  - footer status
  - modal konfigurasi data source

## 3. Komponen Inti

### Header KPI

- Ada panel header utama yang menampilkan identitas aplikasi `AR SEGMEN ERS`.
- Menyediakan:
  - status source data
  - tombol switch data source
  - tombol polling on/off
  - tombol refresh manual
- KPI cards memperlihatkan:
  - total outstanding
  - current vs status tagih
  - invoice status
  - critical aging `> 12 bulan`
- Setiap kartu memakai ikon, angka besar, label kecil, dan progress bar untuk mempercepat pembacaan data.

### Tab Navigation

- Navigasi tab dibuat sebagai bar horizontal dengan tombol pill-style.
- Tab yang tersedia:
  - `Diagram Mind-Map AR (XMind)`
  - `Cards + Grouped Drill-down Table`
  - `Data Transaksi`
  - `Analitik & Sebaran Chart`
- Tab aktif dibedakan lewat background color dan teks putih.
- Desain tab mendukung scroll horizontal di layar sempit.

### Content Views

- `MindMapDiagramView` untuk visualisasi tree/mind-map.
- `GroupedDrilldownView` untuk ringkasan kartu dan tabel bertingkat.
- `RawDataTableView` untuk data transaksi mentah.
- `AnalyticsChartsView` untuk chart distribusi dan proporsi data.

## 4. UX Pola Interaksi

- Data dimuat otomatis saat halaman dibuka.
- Ada polling real-time tiap 10 detik untuk sinkronisasi data.
- Refresh manual tersedia agar user bisa memaksa reload data.
- Toast notification dipakai untuk memberi feedback singkat saat fetch gagal atau aksi berhasil.
- Error koneksi Google Sheets ditampilkan dalam banner khusus agar user langsung tahu kondisi fallback.

## 5. Data Source Experience

- Dashboard mendukung dua mode:
  - `GOOGLE_SHEETS`
  - `MOCK_DATA`
- Modal data source menyediakan:
  - status koneksi
  - input link spreadsheet
  - input nama sheet/tab
  - tombol hubungkan
  - tombol reset config
  - switch mode
- Konfigurasi sheet disimpan di `localStorage` per browser, sehingga masing-masing user bisa punya setting sendiri.

## 6. Feedback dan Status

- Status koneksi ditampilkan lewat badge dengan dot indicator:
  - hijau untuk connected
  - merah untuk error
  - amber untuk standby/mock
- Data source error punya callout terpisah dengan tindakan cepat `Ubah Pengaturan`.
- Footer menampilkan:
  - active source
  - last updated timestamp
  - version marker aplikasi

## 7. Charting dan Data Visualization

- Chart menggunakan `ECharts` dengan container kartu yang konsisten.
- Visualisasi yang dipakai:
  - stacked bar chart per region
  - donut chart aging category
  - horizontal stacked bar per UIC
- Tooltip dan legend disesuaikan dengan tema dashboard yang bersih dan terbaca.

## 8. Responsiveness

- Komponen utama memakai flex wrap dan grid responsif.
- KPI cards berubah dari 1 kolom ke 2 dan 4 kolom sesuai ukuran layar.
- Modal bisa scroll secara vertikal jika kontennya tinggi.
- Tab bar dan button group tetap usable di layar kecil.

## 9. UX Strengths

- Informasi prioritas tampil paling atas, jadi user langsung melihat kondisi bisnis.
- Aksi data source mudah ditemukan dan tidak tersembunyi.
- Kombinasi kartu, tabel, dan chart memberi beberapa tingkat detail untuk user berbeda.
- Warna status konsisten sehingga mudah dipindai secara visual.

## 10. Ringkasan Feature UI/UX

- Dashboard operasional untuk AR monitoring.
- KPI cards untuk insight cepat.
- Tab-based navigation untuk multi-view workflow.
- Real-time polling dan manual refresh.
- Data source switcher antara Google Sheets dan mock data.
- Error state dan status state yang jelas.
- Charts, mind-map, drill-down table, dan raw data view.
- Responsive layout dengan visual hierarchy yang rapi.

