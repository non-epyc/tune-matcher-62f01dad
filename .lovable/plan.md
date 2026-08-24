# Theme Song Matcher

Website dengan login, tempat Anda mengunggah koleksi lagu, lalu mengunggah gambar dan AI memilih lagu paling cocok — beserta potongan bagian lagu (durasi ala Instagram Story) yang paling pas.

## Alur pengguna

1. **Sign up / Sign in** dengan email + password. Data lagu & gambar terikat ke akun.
2. **Library lagu** — upload MP3 (bisa banyak file sekaligus). Tiap lagu diberi judul, artis (opsional), dan bisa diputar langsung dengan pemutar audio.
3. **Match gambar** — upload sebuah gambar. AI menganalisis suasana/isi gambar, membandingkan dengan deskripsi mood lagu di library, lalu menampilkan:
   - lagu terpilih (dengan alasan singkat),
   - waktu mulai potongan + durasi (default 15 detik, bisa diganti 15/30/60),
   - pemutar yang langsung memainkan potongan itu saja (loop di rentang tersebut).
4. **Riwayat** — daftar pasangan gambar + lagu + potongan yang sudah dibuat, bisa dibuka atau dihapus.

## Cara AI mencocokkan (dengan analisis audio nyata)

- **Saat lagu diupload (di browser, sebelum file dikirim):** file didekode dengan Web Audio API dan dianalisis per potongan 1 detik: energi (RMS), kecerahan spektral, estimasi tempo (BPM), dan level bass. Hasilnya jadi "sidik jari" lagu: energi rata-rata, tempo, terang/gelap, plus kurva energi seluruh lagu. Hanya angka-angka ringkas ini yang disimpan (bukan data audio mentah).
- **Bagian paling cocok:** dari kurva energi, sistem mencari jendela sepanjang durasi story (15/30/60 detik) dengan skor terbaik — mis. bagian paling energik & konsisten untuk gambar ceria, atau bagian paling tenang untuk gambar lembut. Ini murni perhitungan, jadi presisinya tidak bergantung pada AI.
- **Saat gambar diupload:** model vision membaca gambar dan mengeluarkan angka setara (energi 0-1, kehangatan, terang/gelap, tempo yang diinginkan, kata kunci mood).
- **Pencocokan:** jarak antara vektor gambar dan sidik jari setiap lagu dihitung di server; lagu dengan jarak terkecil menang, lalu bagian terbaiknya dipilih seperti di atas. AI juga memberi satu kalimat alasan.
- Opsional: AI mendengarkan potongan terpilih (10-15 detik audio dikirim ke model) untuk verifikasi/alasan yang lebih kaya — bisa dimatikan agar hemat biaya.
- Semua pemanggilan AI berjalan di server, tanpa API key yang perlu Anda siapkan.


## Hemat memori/penyimpanan

- Gambar dikompres di browser sebelum diupload (maks sisi panjang ~1280px, JPEG) — hanya versi kecil yang disimpan.
- MP3 disimpan apa adanya, dengan batas ukuran per file (mis. 15 MB) dan peringatan bila melebihi.
- Riwayat menyimpan referensi, bukan salinan file; hapus item akan menghapus filenya juga.
- Audio distream lewat URL bertanda tangan, tidak diunduh penuh.

## Tampilan

Tema gelap ringkas, satu warna aksen, tanpa gambar dekoratif berat: header + navigasi sederhana, kartu lagu bergaya daftar, dan halaman match berisi preview gambar di kiri dan hasil lagu + pemutar potongan di kanan.

## Detail teknis

- Lovable Cloud diaktifkan: auth email/password, database, storage.
- Storage: bucket privat `songs` dan `images`, akses lewat path `{user_id}/...` + RLS pada `storage.objects`.
- Tabel: `profiles`, `songs` (judul, artis, path, durasi, bpm, energy, brightness, bass, `energy_curve` sebagai array float per detik), `matches` (image_path, song_id, start_seconds, clip_seconds, image_vector, reason). Semua dengan GRANT + RLS scoped ke `auth.uid()`.
- Analisis audio: `AudioContext.decodeAudioData` + `AnalyserNode`/FFT manual di Web Worker agar UI tidak macet; kurva energi disimpan didownsample (1 nilai/detik) sehingga hanya beberapa KB per lagu.
- Pemilihan segmen: sliding window pada `energy_curve` dengan skor = kedekatan energi target + stabilitas, dihitung di server function.
- Analisis gambar via server function ke Lovable AI Gateway (model vision Gemini), output JSON tervalidasi Zod; opsi verifikasi audio mengirim potongan terpilih sebagai `input_audio`.
- Rute: `/` landing + CTA masuk, `/auth`, dan `_authenticated/library`, `_authenticated/match`, `_authenticated/history`.
- Pemutar potongan memakai elemen audio dengan batas mulai/akhir dan tombol loop.

## Yang perlu Anda ketahui

Analisis audio dilakukan di browser saat upload, jadi lagu panjang butuh beberapa detik pemrosesan sekali saja. Tempo/energi hasil analisis akurat, tetapi "mood" gambar tetap penilaian AI — Anda masih bisa mengganti lagu secara manual bila hasilnya kurang pas.

