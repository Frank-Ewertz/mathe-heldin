# Lern-Heldin 🦁

Eine Progressive Web App (PWA) für Grundschulkinder mit vier Lern-Übungen.

> Hinweis: Der Name dieses Repositories ist historisch (die App startete als reine Mathe-Übung) – die App selbst heißt durchgehend **Lern-Heldin**.

## Live

**https://frank-ewertz.github.io/mathe-heldin/**

## Modi

| Modus | Übung |
|-------|-------|
| ➕ Mathe | Addition & Subtraktion im Zahlenraum 10/15/20 mit anschaulicher Apfel-Darstellung |
| 📖 Schwingen | Silben schwingen: Bögen setzen und Antwort prüfen (Wortschatz mit 1–5 Silben) |
| 🔤 Anlaute | Zuordnungsspiel: Buchstabe und passendes Bild verbinden (6 Paare pro Runde) |
| ✏️ Silben | Anfangssilben (Konsonant + Vokal) „ausmalen" – Tap-to-Fill mit 4–5 Zeilen pro Runde |

## Features

- Offline nutzbar (Service Worker mit Stale-While-Revalidate)
- Fortschritt (Sterne und Verlauf) wird lokal in IndexedDB gespeichert – keine Server, keine Konten, keine Datenübertragung
- Installierbar als App (PWA-Manifest, Icons, Dauerhaft-Speicher-Anfrage)
- Kindgerechtes Design: große Touchflächen, weiche Animationen, Konfetti-Belohnungen

## Technik

Reines HTML/CSS/JavaScript – keine Frameworks, kein Build-Schritt.

Änderungen veröffentlichen:

```
git add .
git commit -m "Beschreibung der Änderung"
git push origin main
```

GitHub Pages deployt danach automatisch (ca. 1–2 Minuten).