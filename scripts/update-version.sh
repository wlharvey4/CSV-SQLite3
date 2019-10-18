#!/usr/bin/env sh
sed -i .bak -E -e '
/\#\+macro: version Version/bx
/,\/\\"version\\":/by
b
:x
h
s/^(.*macro: version Version )(.*)$/\2/
x
b
:y
H
x
s/\n//
s/^([[:digit:]]+\.[[:digit:]]+\.[[:digit:]]+)(.*)([[:digit:]]+\.[[:digit:]]+\.[[:digit:]]+)/\2\1/
' CSV-SQLite3.org
