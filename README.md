# Vice City

Ein 3D-Open-World-Spiel im Browser in einer Neon-Metropole im Miami-Stil. Der Fokus von Version 1 liegt auf Sportwagen.

Alles wird prozedural erzeugt: Stadt, Autos, Texturen, Himmel und Sound. Das Spiel braucht keine externen Assets und läuft auf Desktop und Mobilgeräten.

## Features (V1)

- **Die Stadt**
  - **Downtown** auf dem Festland mit spiegelnden Glastürmen, deren Kronen nachts in LED-Farben leuchten.
  - **Vice Causeway** und **Starfish Causeway**: zwei Bogenbrücken über die Bucht. Über den Vice Causeway kann man mit Nitro springen.
  - **Vice Beach** mit Art-déco-Hotels in Pastellfarben, Neonschriften, Ocean Drive, Palmenpark, Sandstrand und Rettungsschwimmer-Türmen.
  - Ampeln, Straßenlaternen, Zebrastreifen und Parkplätze.
- **Fünf Sportwagen im 80er-Stil**
  - Fuego GT, Stiletto, Corsair, Monarch 91 und Vapor Spyder (Cabrio).
  - Dazu Limousinen und Taxis im Verkehr.
  - Metallic-Lack mit Klarlack-Reflexionen, lenkende und drehende Räder, Brems- und Scheinwerferlicht.
- **Fahrgefühl im Arcade-Stil**: Driften mit der Handbremse, Nitro (Driften lädt es schneller auf), sechs Gänge, Sprünge und Crashs mit Impulsphysik.
- **KI-Verkehr**
  - Folgt den Fahrspuren, hält an roten Ampeln und hält Abstand.
  - Linksabbieger warten auf den Gegenverkehr.
  - Die KI hupt, wenn der Spieler im Weg steht.
- **Autos klauen**: Aussteigen, zu Fuß herumlaufen, in ein anderes Auto einsteigen oder einem KI-Fahrer das Auto abnehmen. Der Fahrer flüchtet dann zu Fuß.
- **Tag/Nacht-Zyklus** (ein Spieltag dauert 12 Minuten)
  - Physikalischer Himmel mit Wolken, Sonnenuntergang über der Skyline, Sternenhimmel und Mond.
  - Nachts leuchten Fenster, Neon und Laternen, dazu kommt Bloom.
- **Rennen & Challenges** (gelbe Markierungen, auf der Minimap mit „R“ markiert):
  - Ocean Drive Sprint, Downtown-Rundkurs (2 Runden) und Highway Blitz gegen die Uhr.
  - Causeway-Sprung (Weite zählt) und Little Havana Drift (60 Sekunden, Combo-Multiplikator).
  - Jeweils Bronze, Silber und Gold mit Preisgeld. Bestleistungen werden gespeichert.
  - Im Pausenmenü stehen alle Events, dort lässt sich per „Route“ ein Navigationsziel setzen.
- **Polizei & Fahndung** mit 1–5 Sternen:
  - Auslöser sind Carjacking vor Zeugen, das Klauen von Streifenwagen, Rammen, angefahrene Passanten und Rasen vor der Polizei.
  - Streifenwagen mit Blaulicht und Sirene verfolgen dich über das Straßennetz, je mehr Sterne, desto mehr Verstärkung.
  - Außer Sicht bleiben, dann ist die Polizei abgehängt. Wer stehen bleibt, während ein Streifenwagen daneben steht, wird verhaftet (Strafe und Neustart an der Wache).
- **Schäden**: Beulen an der Aufprallstelle, gesprungene Scheiben, Rauch, weniger Leistung und schließlich Totalschaden.
- **Werkstätten** (türkis, „W“ auf der Minimap): Sie reparieren und lackieren für 150 $. Sieht dich gerade kein Polizist, wird dabei auch die Fahndung eingestellt.
- **Autoradio** mit drei Sendern (Flash 86, Wave 92, Night Drive FM). Die 80er-Musik wird live und prozedural komponiert.
- **Spielstand** mit Geld, Bestleistungen und Radiosender wird im Browser gespeichert.
- **HUD**: analoger Tacho mit Drehzahl, Gang, Nitro und Zustand des Autos, rotierende Minimap mit Symbolen, Uhrzeit, Geld, Fahndungssterne und Stadtteil-Einblendungen.
- **Synthetischer Sound** über Web Audio: Motor, Reifenquietschen, Fahrtwind, Crashs, Hupe und Meeresrauschen.
- **Mobil spielbar**: Touch-Joystick und Touch-Buttons, drei Qualitätsstufen, die automatisch herunterschalten, wenn es ruckelt. Dazu LOD für entfernte Autos und Culling für die Stadt-Kacheln.

## Steuerung

| Aktion | Tastatur | Touch | Gamepad |
| --- | --- | --- | --- |
| Fahren / Laufen | `W` `A` `S` `D` / Pfeiltasten | Joystick links, GAS/BREMSE | Linker Stick, RT/LT |
| Handbremse (Drift) | `Leertaste` | DRIFT | A |
| Nitro / Sprinten | `Shift` | NITRO | X |
| Ein- / Aussteigen, Auto klauen | `F` oder `E` | EIN / AUS | Y |
| Kamera wechseln | `C` | CAM | RB |
| Kamera drehen | Maus ziehen | Rechts wischen | Rechter Stick |
| Hupe | `H` | HUPE | B |
| Radiosender wechseln | `Q` | RADIO | – |
| Rennen starten (in der gelben Markierung) | `Enter` oder `G` | START | – |
| Auto auf die Straße zurücksetzen | `R` | – | – |
| Zeit vorspulen (gedrückt halten) | `T` | – | – |
| Ton an/aus · Pause | `M` · `Esc` | ♪ · ❚❚ | Start |

Im Pausenmenü lassen sich die Tageszeit (Morgen, Mittag, Sonnenuntergang, Nacht) und die Grafikqualität umstellen.

## Starten

Voraussetzung ist Node.js ab Version 18.

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173 (auch im WLAN erreichbar, zum Testen am Handy)
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

### Veröffentlichen (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut das Spiel bei jedem Push auf `main` und veröffentlicht es auf GitHub Pages. Dafür muss einmalig unter **Settings → Pages → Build and deployment** die Quelle **GitHub Actions** ausgewählt werden.

## Projektstruktur

```
src/
  main.js               Spielschleife, Ein-/Aussteigen, Rendering, Zusammenspiel aller Systeme
  camera.js             Verfolgerkamera (Auto/zu Fuß), Gebäude-Kollision, Kamerawackeln
  core/                 Eingabe (Tastatur/Maus/Touch/Gamepad), Audio, Autoradio, Qualitätsstufen, Hilfsfunktionen
  world/
    layout.js           Stadtplan: Straßengraph, Brücken, Blöcke, Höhenprofil, Ampelphasen
    city.js             Stadtgenerator: Gebäude, Art-déco-Hotels, Parks, Strand, Markierungen, Brücken, Wasser
    props.js            Palmen (instanziert, mit Wind), Laternen, Ampeln
    sky.js              Tag/Nacht-Zyklus, Himmel, Sonne/Mond, Nebel, Umgebungs-Map für Reflexionen
    textures.js         Prozedurale Canvas-Texturen (Fassaden, Asphalt, Palmwedel, Neonschilder …)
    collision.js        Statische Kollision (Raster aus Boxen), Sichtlinien-Test
  vehicles/
    models.js           Prozedurale Automodelle (extrudierte Profile) + LOD
    vehicle.js          Arcade-Fahrphysik, Kollisionen mit Impulsen
    traffic.js          Verkehrs-KI und Spawn-Verwaltung
  game/
    events.js           Rennen, Sprung- und Drift-Challenges, Medaillen
    police.js           Fahndungssystem, Verfolger-KI mit Routenplanung (A*)
    garage.js           Werkstätten (Reparatur, Neulackierung)
    markers.js          Leuchtende Markierungen (Start, Checkpoint, Werkstatt)
    save.js             Spielstand im Browser
  characters/           Spielfigur und Fußgänger (Hawaiihemd inklusive)
  ui/                   HUD (Tacho, Minimap) und Touch-Steuerung
```

## Fahrplan

- **V2, Etappe 1 (erledigt):** Rennen und Challenges, Polizei, Schäden, Werkstätten, Radio, Speichern
- **V2, Etappe 2:** Street-Racing-Karriere mit Rivalen, Story und Missionen
- **V2, Etappe 3:** Online-Rennen mit Freunden (Räume per Link, über Supabase Realtime)
- Später: Fußgänger, Motorräder und Boote
