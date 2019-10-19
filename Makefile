SOURCE = CSV-SQLite3
ORG    = $(SOURCE).org
TEXI   = $(SOURCE).texi
INFO   = $(SOURCE).info
PDF    = $(SOURCE).pdf
DOCS   = docs
LIB    = lib
SCRIPTS=scripts

.PHONY: clean clean-world clean-prod
.PHONY: tangle weave texi info pdf
.PHONY: install install-docs install-info install-pdf open-pdf docs-dir
.PHONY: update-dev update-prod checkout-dev checkout-prod
.PHONY: update-version tangle-update-version run-update-version

texi: $(TEXI)
$(TEXI): $(ORG)
	emacs -Q --batch $(ORG) \
	--eval '(setq org-export-use-babel nil)' \
	--eval '(org-texinfo-export-to-texinfo)'

tangle: $(ORG)
	emacs -Q --batch $(ORG) \
	--eval '(org-babel-tangle-file "$(ORG)")'

info weave install-info: $(DOCS)/$(INFO)
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

docs-dir: $(DOCS)
$(DOCS):
	mkdir -vp docs


update-version: update-dev update-prod

checkout-dev:
	git checkout dev

update-dev: checkout-dev run-update-version
	git add -u
	git commit --amend -C HEAD
	git push origin +dev

checkout-prod: clean-world checkout-dev
	git checkout -B prod

update-prod: checkout-prod install clean-prod
	git add -A .
	git commit -m "Branch:prod"
	git push origin +prod

run-update-version: tangle-update-version
	./$(SCRIPTS)/update-version.sh
	mv -v $(ORG).bak $(WORKBAK)/$(ORG).$(shell date "+%s")

tangle-update-version: $(SCRIPTS)/update-version.sh
$(SCRIPTS)/update-version.sh: $(ORG)
	emacs -Q --batch $(ORG) \
	--eval '(search-forward ":tangle scripts/update-version.sh")' \
	--eval '(org-babel-tangle '\''(4))'


clean:
	-rm *~

clean-world: clean
	-rm *.{texi,info,pdf,js,json,lock,log,bak}
	-rm -rf LogReader
	-rm -rf node_modules $(SCRIPTS) $(DOCS) $(LIB)

clean-prod: clean
	-rm *.{texi,org} Makefile LogReader
	-rm -rf node_modules
