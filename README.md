# Vice City

Ein 3D-Open-World-Spiel im Browser in einer Neon-Metropole im Miami-Stil, mit Fokus auf Sportwagen und einer Street-Racing-Karriere.

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
- **Spielstand** mit Geld, Ruf, Karriere-Fortschritt, eigenen Autos, Bestleistungen und Radiosender wird im Browser gespeichert.
- **HUD**: analoger Tacho mit Drehzahl, Gang, Nitro und Zustand des Autos, rotierende Minimap mit Symbolen, Uhrzeit, Geld, Fahndungssterne und Stadtteil-Einblendungen.
- **Synthetischer Sound** über Web Audio: Motor, Reifenquietschen, Fahrtwind, Crashs, Hupe und Meeresrauschen.
- **Mobil spielbar**: Touch-Joystick und Touch-Buttons, drei Qualitätsstufen, die automatisch herunterschalten, wenn es ruckelt. Dazu LOD für entfernte Autos und Culling für die Stadt-Kacheln.

## Motorräder und neue Autos (V3, Etappe 1)

- **Drei Motorräder**:
  - **Shinobi 750**: Sportbike, schnellstes Beschleunigen im Spiel.
  - **Hogg Cruiser**: Chopper mit V2-Motor und Ape-Hanger-Lenker.
  - **Zippy Roller**: Motorroller, langsam, aber wendig.
- **Fahrgefühl auf dem Motorrad**:
  - In Kurven legt man sich in die Schräglage.
  - Beim harten Anfahren oder mit Nitro gibt es einen Wheelie (nicht beim Roller).
  - Abgestellte Motorräder stehen schräg auf dem Seitenständer.
  - Ein harter Aufprall wirft den Fahrer ab („Sturz!“), das Motorrad bleibt auf der Seite liegen. Mit `F` bzw. EIN steigt man wieder auf.
  - Jedes Motorrad klingt anders: Das Sportbike kreischt, der Chopper brummt tief.
- **Fünf neue Autos**:
  - **Bruiser 440**: Muscle Car mit viel Drehmoment und lockerem Heck.
  - **Regent SEC**: Luxus-Coupé.
  - **Hauler Van**, **Rancher Pickup** und **Stretch-Limousine** fahren im Verkehr.
- Motorräder und neue Autos sind im Verkehr unterwegs, stehen auf Parkplätzen und lassen sich klauen. Motorräder, Bruiser und Regent gibt es auch bei Sunshine Autos.

## Street-Racing-Karriere (V2, Etappe 2)

Vom Nobody zum Champion von Vice City. Lola Reyes von **Sunshine Autos** leiht dir zum Start einen Vapor Spyder und schickt dich zu den drei Crews der Stadt.

- **3 Kapitel mit je 5 Missionen**, am Ende jedes Kapitels ein Boss-Rennen:
  1. **Vice Beach**: Flamingo Kings (Boss: Rico „Flamingo“ Valdez), Treffpunkt ist die Flamingo Lounge am Ocean Drive.
  2. **Little Havana**: Los Cuervos (Boss: Esteban „El Cuervo“ Ortiz), Treffpunkt ist das Café Cuervo.
  3. **Downtown**: Chrome Syndicate (Boss: Victor Kane), Treffpunkt ist der Kane Tower.
- **Missionstypen**
  - Rennen gegen 1–3 Rivalen, teils mit Polizeieinsatz. Die Positionsanzeige (1./2./3.) steht im HUD.
  - Drift-Battle gegen die Punktzahl eines Rivalen.
  - Überführung eines fremden Autos unter Zeitdruck und mit Schadenslimit.
  - Verfolgung: einem Rivalen folgen, ohne zu nah heranzukommen (Verdachtsanzeige) oder ihn zu verlieren.
- **KI-Rennfahrer** fahren eine Ideallinie über das Straßennetz (A*). Sie bremsen vor Kurven, nutzen Nitro auf Geraden, weichen dem Verkehr aus und haben ein leichtes Rubber-Banding. Jeder Rivale hat seinen eigenen Fahrstil (Kurventempo, Nitro, Drift). Wer hängen bleibt, setzt zurück, und zwar nur, wenn die Kamera es nicht sieht.
- **Ruf-System**: Missionen verlangen einen Mindest-Ruf. Ruf gibt es für Missionen, neue Medaillen in den freien Rennen (20/40/80) und fürs Abhängen der Polizei (10 je Stern). Ränge reichen von „Nobody“ bis „Legende“, am Ende steht „Champion von Vice City“.
- **Dialogkarten** in Deutsch vor und nach jeder Mission (Name, farbiges Porträt, 2–4 Zeilen). Weiter geht es mit `Enter`, per Klick oder durch Tippen.
- **Missionsgeber** erscheinen als farbige Markierung in der Stadt und als „!“ auf der Minimap. Der Hinweis auf die nächste Mission steht im HUD (Desktop) und im Pausenmenü.
- Für Crew-Missionen braucht man ein **eigenes Auto**, mit geklauten Autos fährt keine Crew.
- **Sunshine Autos** (grün, „$“ auf der Minimap):
  - Hier kauft man alle Sportwagen, dazu die exklusiven Modelle **Toro 88** und **Phantom X**. Teure Modelle brauchen zusätzlich Ruf.
  - Eigene Autos kann man abholen und kostenlos umlackieren, repariert werden sie hier ebenfalls kostenlos.
  - Gekaufte Autos, ihre Farbe und das zuletzt gefahrene Auto werden gespeichert.
- **Pausenmenü**: Karriere-Übersicht mit Rang, Ruf, Kapiteln, erledigten Missionen und Rivalen. Dazu Routen zur nächsten Mission und zum Autohändler.

## Steuerung

| Aktion | Tastatur | Touch | Gamepad |
| --- | --- | --- | --- |
| Fahren / Laufen | `W` `A` `S` `D` / Pfeiltasten | Joystick links, GAS/BREMSE | Linker Stick, RT/LT |
| Handbremse (Drift) | `Leertaste` | DRIFT | A |
| Nitro / Sprinten | `Shift` | NITRO | X |
| Ein- / Aussteigen, Auf- / Absteigen, Fahrzeug klauen | `F` oder `E` | EIN / AUS | Y |
| Kamera wechseln | `C` | CAM | RB |
| Kamera drehen | Maus ziehen | Rechts wischen | Rechter Stick |
| Hupe | `H` | HUPE | B |
| Radiosender wechseln | `Q` | RADIO | – |
| Rennen, Mission oder Autohaus starten (in der Markierung) | `Enter` oder `G` | START | – |
| Dialog weiter | `Enter`, `F` oder Klick | Tippen | – |
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

### Zum Home-Bildschirm hinzufügen

Das Spiel hat ein App-Icon und ein Web-App-Manifest (`public/manifest.webmanifest`, Icons in `public/icons/`). Auf dem iPhone in Safari **Teilen → Zum Home-Bildschirm**, unter Android in Chrome **⋮ → Zum Startbildschirm hinzufügen**. Danach startet Vice City im Vollbild und im Querformat.

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
    models.js           Prozedurale Automodelle (extrudierte Profile) + LOD, Aufbau der Motorräder
    bikes.js            Motorrad-Modelle und Fahrerfigur
    vehicle.js          Arcade-Fahrphysik, Kollisionen mit Impulsen, Schräglage und Wheelies
    traffic.js          Verkehrs-KI und Spawn-Verwaltung
  game/
    events.js           Rennen, Sprung- und Drift-Challenges, Medaillen, Drift-Wertung
    career.js           Karriere-Inhalte: Figuren, Crews, Kapitel, Missionen, Dialoge, Ränge
    career-manager.js   Karriere-Ablauf: Missionsgeber, Ruf-Sperren, Belohnungen, Übersicht
    missions.js         Missionstypen: Rennen, Drift-Battle, Überführung, Verfolgung
    racer.js            Ideallinie über den Straßengraph und KI-Rennfahrer
    dealer.js           Autohändler Sunshine Autos und eigene Autos
    police.js           Fahndungssystem, Verfolger-KI mit Routenplanung (A*)
    garage.js           Werkstätten (Reparatur, Neulackierung)
    markers.js          Leuchtende Markierungen (Start, Checkpoint, Werkstatt)
    save.js             Spielstand im Browser
  characters/           Spielfigur und Fußgänger (Hawaiihemd inklusive)
  ui/                   HUD (Tacho, Minimap), Dialogkarten und Touch-Steuerung
```

## Fahrplan

- **V2, Etappe 1 (erledigt):** Rennen und Challenges, Polizei, Schäden, Werkstätten, Radio, Speichern
- **V2, Etappe 2 (erledigt):** Street-Racing-Karriere mit Rivalen, Story, Missionen, Ruf und Autohändler
- **V3, Etappe 1 (erledigt):** Motorräder und neue Autos
- **V3, Etappe 2:** Hafen-Stadtteil, Fußgänger, Wetter
- **V3, Etappe 3:** Online-Rennen und freie Fahrt mit Freunden (Räume per Link, Supabase Realtime)
