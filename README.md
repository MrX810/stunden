# stunden

Eine mobile Webapp zum einfachen Erfassen von Arbeitsstunden. Entwickelt für schnelle Einträge auf dem Smartphone, ohne Konto, Server oder unnötige Komplexität.

## Funktionen

- Arbeitsdauer pro Tag mit optionaler Beschreibung erfassen
- Mehrere Sessions pro Tag hinzufügen und bearbeiten
- Wochen- oder Monatsziel festlegen
- Wochen- und Monatsfortschritt vergleichen
- Monatskalender und Jahresheatmap
- JSON-Backups erstellen und wiederherstellen
- Monatliche Stundentabelle als CSV exportieren
- Deutsch und Englisch sowie Dark und Light Mode
- Als Webapp zum Home-Bildschirm hinzufügbar und offline nutzbar

## Datenschutz und Speicherung

Alle Einträge, Ziele und Einstellungen werden ausschließlich im Local Storage des verwendeten Browsers gespeichert. Es gibt keine Anmeldung, keine Analysewerkzeuge und keine Übertragung an einen Server.

Da Browserdaten verloren gehen können, sollten regelmäßig JSON-Backups über die Einstellungen erstellt werden.

## Technik

Die App besteht aus HTML, CSS und nativen JavaScript-Modulen. Sie benötigt kein Framework, keinen Build-Schritt und keine extern geladenen Laufzeit-Abhängigkeiten. Schriftarten und Icons liegen direkt im Projekt.

## Veröffentlichung

Die Dateien können direkt über GitHub Pages bereitgestellt werden. Die App verwendet ausschließlich relative Pfade und funktioniert daher auch in einem Repository-Unterordner.

## Lizenzhinweise

Die mitgelieferten Schriftarten Fraunces und Manrope stehen unter der SIL Open Font License. Die jeweiligen Lizenztexte befinden sich unter `assets/`.
