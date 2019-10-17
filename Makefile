SOURCE = CSV-SQLite3
ORG    = $(SOURCE).org
TEXI   = $(SOURCE).texi
INFO   = $(SOURCE).info
PDF    = $(SOURCE).pdf
DOCS   = docs
SCRIPTS=scripts/

.PHONY: clean clean-world
.PHONY: tangle weave texi info pdf open-pdf
.PHONY: install-docs install-info install-pdf docs-dir

tangle: $(ORG)
	emacs --batch $(ORG) \
	--eval '(org-babel-tangle-file "$(ORG)")'

weave: texi info

texi: $(TEXI)
$(TEXI): $(ORG)
	emacs --batch $(ORG) \
	--eval '(require '\''ob-shell)' \
	--eval '(require '\''ob-js)' \
	--eval '(setq org-confirm-babel-evaluate nil)' \
	--eval '(org-texinfo-export-to-texinfo)'

info install-info: $(DOCS)/$(INFO)
$(DOCS)/$(INFO): $(TEXI) | docs-dir
	makeinfo --output=$(DOCS)/ $(TEXI)

install-docs: install-info install-pdf

pdf install-pdf: $(DOCS)/$(PDF)
$(DOCS)/$(PDF): $(TEXI) | docs-dir
	pdftexi2dvi -q -c $(TEXI)
	mv $(PDF) $(DOCS)/

open-pdf: $(DOCS)/$(PDF)
	open $(DOCS)/$(PDF)

docs-dir: docs
docs:
	mkdir -vp docs

clean:
	-rm *~

clean-world: clean
	-rm *.{texi,info,pdf,js,json,lock,log}
	-rm -rf LogReader
	-rm -rf node_modules $(SCRIPTS) $(DOCS)

clean-prod: clean
	-rm *.{texi.org} Makefile LogReader
	-rm -rf node_modules

prod: clean install-docs clean-prod
	git checkout -B prod
	git add -A .
	git commit -m "branch:prod"
	git push -f origin prod
