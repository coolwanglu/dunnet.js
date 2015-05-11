#!/bin/bash
set -e

FILES="meli.js index.html dunnet.css dunnet.js dunnet.el"

git checkout master
make
mkdir /tmp/dunnet.js || true
rm /tmp/dunnet.js/* || true
for f in $FILES; do
    cp $f /tmp/dunnet.js/
done
rm meli.js
git checkout gh-pages
for f in $FILES; do
    cp /tmp/dunnet.js/$f .
done
git commit -am "upload script"
git push
git checkout master
make
