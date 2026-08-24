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

## Cara AI mencocokkan

- Saat lagu diupload: AI menghasilkan profil mood singkat (energi, suasana, kata kunci) dari judul/artis, dan Anda bisa mengoreksi tag mood secara manual.
- Saat gambar diupload: model vision membaca gambar (mood, warna, situasi), lalu memilih lagu dengan profil mood paling dekat dan mengusulkan detik mulai potongan (mis. menuju bagian klimaks lagu berdasar durasi lagu dan mood gambar).
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
- Tabel: `profiles` (nama tampilan), `songs` (judul, artis, path, durasi, mood_tags, mood_summary), `matches` (image_path, song_id, start_seconds, clip_seconds, reason). Semua dengan GRANT + RLS scoped ke `auth.uid()`.
- Analisis AI lewat server function (Lovable AI Gateway, model vision Gemini) — gambar dikirim sebagai data URL, output JSON tervalidasi Zod.
- Rute: `/` landing + CTA masuk, `/auth`, dan `_authenticated/library`, `_authenticated/match`, `_authenticated/history`.
- Pemutar potongan memakai elemen audio dengan pembatas waktu mulai/akhir dan tombol loop.

## Yang perlu Anda ketahui

Pencocokan didasarkan pada mood yang disimpulkan AI dari metadata lagu, bukan analisis gelombang audio; menambahkan tag mood manual akan membuat hasil lebih tepat.
