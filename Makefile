SOURCE = CSV-SQLite3
ORG    = $(SOURCE).org
TEXI   = $(SOURCE).texi
INFO   = $(SOURCE).info
PDF    = $(SOURCE).pdf
DOCS   = docs
SCRIPTS=scripts

.PHONY: clean clean-world
.PHONY: tangle weave texi info pdf open-pdf
.PHONY: install install-docs install-info install-pdf docs-dir

texi: $(TEXI)
$(TEXI): $(ORG)
	emacs -Q --batch $(ORG) \
	--eval '(setq org-export-use-babel nil)' \
	--eval '(org-texinfo-export-to-texinfo)'

tangle: $(ORG)
	emacs -Q --batch $(ORG) \
	--eval '(org-babel-tangle-file "$(ORG)")'

weave info install-info: $(DOCS)/$(INFO)
$(DOCS)/$(INFO): $(TEXI) | docs-dir
	makeinfo --output=$(DOCS)/ $(TEXI)

install: package.json
package.json:	$(ORG) | docs-dir
	emacs -Q --batch $(ORG) \
	--eval '(require '\''ob-shell)' \
	--eval '(require '\''ob-js)' \
	--eval '(setq org-confirm-babel-evaluate nil)' \
	--eval '(org-texinfo-export-to-info)'
	mv $(INFO) $(DOCS)/
	make install-pdf

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

checkout-dev:
	git checkout dev

update-version: checkout-dev tangle-update-version
	./$(SCRIPTS)/update-version.sh
	mv -v $(ORG).bak $(WORKBAK)/$(ORG).$(shell date "+%s")
	make clean-world
	git add -u
	git commit --amend -C HEAD
	git push -f origin dev

tangle-update-version: $(SCRIPTS)/update-version.sh
$(SCRIPTS)/update-version.sh: $(ORG)
	emacs -Q --batch $(ORG) \
	--eval '(search-forward "update-version.sh")' \
	--eval '(org-babel-tangle '\''(4))'

clean:
	-rm *~

clean-world: clean
	-rm *.{texi,info,pdf,js,json,lock,log,bak}
	-rm -rf LogReader
	-rm -rf node_modules $(SCRIPTS) $(DOCS)

clean-prod: clean
	-rm *.{texi,org} Makefile LogReader
	-rm -rf node_modules

prod: update-version install clean-prod
	git checkout -B prod
	git add -A .
	git commit -m "branch:prod"
	git push -f origin prod
