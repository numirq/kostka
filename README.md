# Duo Timer

Timer do kostki 3×3 dla dwóch znajomych. Ma ekran profili inspirowany Netflixem, zmianę profilu, automatyczne scramble, PB, ao5, ao12 i bezpośrednie porównanie wyników.

## Uruchomienie na komputerze

Wymagany jest Node.js 22.

```bash
npm install
npm run dev
```

## Publikacja na GitHub Pages

1. Utwórz repozytorium na GitHubie, np. `duo-timer`.
2. Wgraj do niego cały projekt i użyj gałęzi `main`.
3. Wejdź w `Settings → Pages`.
4. W `Source` wybierz `GitHub Actions`.
5. Każde wysłanie zmian na `main` automatycznie zbuduje i opublikuje stronę.

Workflow sam wykrywa, czy strona jest publikowana pod adresem `nazwa.github.io`, czy `nazwa.github.io/repozytorium`.

## Dane

Bez konfiguracji bazy profile i czasy są zapisywane w pamięci przeglądarki. Do synchronizacji między dwoma różnymi komputerami projekt obsługuje darmowy Supabase — nadal bez loginów i haseł.

### Synchronizacja dwóch komputerów

1. Utwórz projekt na [Supabase](https://supabase.com/dashboard).
2. W `Authentication → Providers → Anonymous Sign-Ins` włącz logowanie anonimowe. Działa ono automatycznie w tle i nie pokazuje żadnego formularza logowania.
3. Otwórz `SQL Editor`, wklej całą zawartość `supabase/schema.sql` i uruchom zapytanie.
4. W repozytorium GitHub otwórz `Settings → Secrets and variables → Actions` i dodaj:
   - `NEXT_PUBLIC_SUPABASE_URL` — adres projektu,
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — klucz `sb_publishable_...`,
   - `NEXT_PUBLIC_DUO_ROOM` — własny długi kod, znany tylko wam, np. wygenerowany UUID.
5. Ponownie uruchom workflow albo wyślij dowolną zmianę na `main`.

Oba komputery korzystające z tej samej strony zobaczą wspólne profile i wyniki. Strona odświeża porównanie automatycznie co kilka sekund.
