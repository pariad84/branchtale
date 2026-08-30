// Branchtale -- a platform for branching visual novels built on fn.js + fn.util.js, not just one
// story: the Library screen lists every Story a reader has added ("+ New Story" makes one), and
// picking a card opens that story's own Reader/Editor/Endings, all scoped to it. Story is a plain
// CRUD resource (title/author/description); Scene is the whole story graph underneath one Story
// row -- each row is one beat (key/title/text/choices) plus a `storyId` scoping it to its Story,
// since a scene's own `key` (see below) is only unique *within* a story, not globally. The
// first story ("Signal Lost") is seeded once in app.js like idle-hunter's Ground rows, but --
// unlike Ground -- genuinely CRUD'd here: the Editor screen (behind an "Editor" button) is
// exactly the standard `list` + popup/form/save-btn pattern every other example uses, so writing
// your own story means clicking a row (or "+ New Scene") and editing it like any other resource.
// Scenes reference each other by their own `key` field (a stable string like 'bridge_solo'), not
// by fn.data's auto-increment id, since the graph is hand- or reader-written and needs stable
// targets for `choice.next` -- goToScene looks a scene up by that key (scoped to the story the
// current route names) via fn.util.selectFlat + .find rather than fn.data.select's id lookup.
// Which story/scene/tab is showing is itself a route (see parseHash below), not module state.
// `choices` is stored
// as a real array (same as every other resource field), but its form field carries a
// `column.form.json: true` flag this file's own `form` layout understands: populate the textarea
// with `JSON.stringify(value, null, 2)` instead of the raw value, and `JSON.parse` it back on
// save -- so a reader authors a scene's branches as JSON text directly, the same idea as the
// framework's read-only JSON-preview escape hatch but round-tripping instead of just previewing.
// exportStory/importStory extend that same JSON-as-source-of-truth idea to the whole story: a
// Download button serializes every Scene row into one JSON array (a portable "novel file"), and
// an Upload file input replaces every Scene row with a freshly parsed one (validated to include a
// 'start' key) -- both built from nothing but fn.data.select/insert/delete, no framework change
// needed. Because a reader can wire `choice.next` to anything, the graph isn't guaranteed acyclic
// the way the seeded story is -- a "Check for Loops" button runs findCycles (a plain DFS that
// tracks which keys are on the current path; a choice back into that path is a back-edge, i.e. a
// real loop) and reports any it finds by title in a popup. It's informational only, same as
// everything else in the Editor -- a loop is a legitimate narrative device (a repeating day, a
// hub you can leave and return to), not an error, so this never blocks saving or importing.
// A scene with an empty `choices` array *is* an ending: goToScene logs it into the Ending
// resource the moment you first arrive (not on every re-render, which would double-count), so
// EndingLog is a real, replayable resource -- reach the same or a different ending across
// playthroughs and it keeps growing, genuinely worth paging through (list/pagination, unchanged
// from the reference implementation) once a few playthroughs pile up. That log lives behind an
// "Endings" popup rather than a tab bar, same reasoning the Editor toggle uses instead of a tab
// bar of its own: this app only ever shows one of three screens at a time (library/story/editor),
// and only Editor and Library are substantial enough to need their own screen rather than a
// popup. Player is CRUD'd through the usual popup/form/save-btn only for its name (the Rename
// button), and Story through it for everything (title/author/description), from the Library.
// Multi-language content reuses that same `column.form.json` mechanism rather than adding new
// machinery: `title`/`text`/`endingType`/`choices` are stored as `{lang: value}` objects (e.g.
// `title: {en: "...", ko: "..."}`), authored together as one JSON blob per field in one save --
// there is no separate "add a translation" action. getLocalized(obj) reads `obj[currentLang]`,
// falling back to `.en`; the story screen's language <select> is built from
// `Object.keys(scene.title)`, so a scene that only has `en` shows no other option, and any
// language a reader adds to a scene's JSON shows up automatically next time that scene renders.
// findCycles walks every language's choices (deduped) since the graph is meant to be the same
// shape across languages -- only the labels differ.
(function() {
    var fn = window.fn;

    var playerResource = null;
    var storyResource = null;
    var endingResource = null;
    var sceneResource = null;
    var playerId = null;
    var routeEl = null;
    var currentLang = 'en';
    var langLabels = { en : 'English', ko : '한국어' };

    // Which story/scene/tab is showing is a real route (fn.util.route in fn.util.js), not module
    // state -- '#/' is the Library, '#/story/<id>' reads that story starting at 'start',
    // '#/story/<id>/scene/<key>' a specific scene, '#/story/<id>/editor' its Editor tab. That
    // means the physical back button steps back through scenes/tabs/stories instead of leaving
    // the app, and a scene mid-story is a real, shareable/reloadable URL.
    function parseHash() {
        var hash = location.hash;
        var m = hash.match(/^#\/story\/(\d+)\/editor$/);
        if (m) {
            return { mode : 'editor', storyId : Number(m[1]) };
        }
        m = hash.match(/^#\/story\/(\d+)\/scene\/([^/]+)$/);
        if (m) {
            return { mode : 'story', storyId : Number(m[1]), sceneKey : decodeURIComponent(m[2]) };
        }
        m = hash.match(/^#\/story\/(\d+)$/);
        if (m) {
            return { mode : 'story', storyId : Number(m[1]), sceneKey : 'start' };
        }
        return { mode : 'library' };
    }

    function getLocalized(obj) {
        if (!obj) {
            return '';
        }
        if (obj[currentLang] !== undefined) {
            return obj[currentLang];
        }
        if (obj.en !== undefined) {
            return obj.en;
        }
        return '';
    }

    function getPlayer() {
        return fn.data.select({ key : 'player', id : playerId });
    }

    function findScene(storyId, key) {
        return fn.util.selectFlat({ key : 'scene' }).find(function(scene) { return scene.storyId === storyId && scene.key === key; });
    }

    function refreshScreen() {
        routeEl.refresh();
    }

    function openEditor() {
        location.hash = '#/story/' + parseHash().storyId + '/editor';
    }

    function closeEditor() {
        location.hash = '#/story/' + parseHash().storyId;
    }

    function openStory(storyId) {
        location.hash = '#/story/' + storyId;
    }

    function goToLibrary() {
        location.hash = '#/';
    }

    function seedStartScene(storyId) {
        fn.data.insert({
            key : 'scene',
            data : {
                storyId : storyId,
                key : 'start',
                title : { en : 'Untitled' },
                text : { en : 'Write your first scene here.' },
                endingType : { en : '' },
                choices : { en : [] },
            },
        });
    }

    function deleteStory(storyId) {
        if (!confirm('Delete this story and all its scenes? This cannot be undone.')) {
            return;
        }
        fn.data.delete({ key : 'story', id : storyId });
        fn.data.select({ key : 'scene' }).filter(function(row) { return row.data.storyId === storyId; }).forEach(function(row) {
            fn.data.delete({ key : 'scene', id : row.id });
        });
        fn.data.select({ key : 'ending' }).filter(function(row) { return row.data.storyId === storyId; }).forEach(function(row) {
            fn.data.delete({ key : 'ending', id : row.id });
        });
        refreshScreen();
    }

    function slugify(title) {
        return (title || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'story';
    }

    function exportStory() {
        var storyId = parseHash().storyId;
        var story = fn.data.select({ key : 'story', id : storyId });
        var scenes = fn.util.selectFlat({ key : 'scene' }).filter(function(s) { return s.storyId === storyId; }).map(function(s) {
            return { key : s.key, title : s.title, text : s.text, endingType : s.endingType || {}, choices : s.choices };
        });
        var blob = new Blob([ JSON.stringify(scenes, null, 2) ], { type : 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = fn.element.create({ tagName : 'a', attribute : { href : url, download : slugify(story.data.title) + '.json' } });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function importStory(file) {
        var reader = new FileReader();
        reader.onload = function() {
            var parsed;
            try {
                parsed = JSON.parse(reader.result);
            } catch (e) {
                alert('That file is not valid JSON.');
                return;
            }
            if (!Array.isArray(parsed) || !parsed.some(function(s) { return s.key === 'start'; })) {
                alert('Expected a JSON array of scenes, including one with key "start".');
                return;
            }
            var storyId = parseHash().storyId;
            fn.data.select({ key : 'scene' }).filter(function(row) { return row.data.storyId === storyId; }).forEach(function(row) {
                fn.data.delete({ key : 'scene', id : row.id });
            });
            parsed.forEach(function(scene) {
                fn.data.insert({
                    key : 'scene',
                    data : { storyId : storyId, key : scene.key, title : scene.title, text : scene.text, endingType : scene.endingType || {}, choices : scene.choices || {} },
                });
            });
            refreshScreen();
        };
        reader.readAsText(file);
    }

    // Standard directed-graph cycle detection: DFS from every scene, tracking which keys are on
    // the current path (`inStack`). A choice pointing at a key still on that path is a back-edge
    // -- a real loop -- and the path slice from that key to here (plus the repeat) is the cycle,
    // reported by title. Purely informational (see the file header) -- never blocks save/import.
    function findCycles() {
        var byKey = {};
        var storyId = parseHash().storyId;
        fn.util.selectFlat({ key : 'scene' }).filter(function(s) { return s.storyId === storyId; }).forEach(function(s) { byKey[s.key] = s; });

        var cycles = [];
        var visited = {};
        var stack = [];
        var inStack = {};

        function nextKeysOf(scene) {
            var seen = {};
            var keys = [];
            Object.keys(scene.choices || {}).forEach(function(lang) {
                (scene.choices[lang] || []).forEach(function(choice) {
                    if (!seen[choice.next]) {
                        seen[choice.next] = true;
                        keys.push(choice.next);
                    }
                });
            });
            return keys;
        }

        function dfs(key) {
            if (visited[key] || !byKey[key]) {
                return;
            }
            stack.push(key);
            inStack[key] = true;

            nextKeysOf(byKey[key]).forEach(function(next) {
                if (inStack[next]) {
                    var idx = stack.indexOf(next);
                    var path = stack.slice(idx).concat(next);
                    cycles.push(path.map(function(k) { return byKey[k] ? getLocalized(byKey[k].title) : k; }));
                } else {
                    dfs(next);
                }
            });

            stack.pop();
            inStack[key] = false;
            visited[key] = true;
        }

        Object.keys(byKey).forEach(dfs);
        return cycles;
    }

    function openLoopCheck() {
        var cycles = findCycles();
        fn.component.create({
            name : 'popup',
            title : 'Loop Check',
            render : function(popupEl) {
                if (cycles.length === 0) {
                    fn.element.create({ tagName : 'div', text : 'No loops detected.', style : { color : dim }, parent : popupEl.content });
                    return;
                }
                fn.element.create({
                    tagName : 'div', text : cycles.length + (cycles.length === 1 ? ' loop found:' : ' loops found:'),
                    style : { fontWeight : '700', color : accent, marginBottom : '10px' }, parent : popupEl.content,
                });
                cycles.forEach(function(cycle) {
                    fn.element.create({ tagName : 'div', text : cycle.join(' → '), style : { fontSize : '13px', marginBottom : '8px', color : text }, parent : popupEl.content });
                });
            },
        });
    }

    function goToScene(key) {
        var storyId = parseHash().storyId;
        var scene = findScene(storyId, key);
        var choices = getLocalized(scene.choices) || [];
        if (choices.length === 0) {
            fn.data.insert({ key : 'ending', data : { storyId : storyId, endingTitle : getLocalized(scene.title), endingType : getLocalized(scene.endingType) } });
        }
        location.hash = '#/story/' + storyId + '/scene/' + encodeURIComponent(key);
    }

    function openRename() {
        var player = getPlayer();
        fn.component.create({
            name : 'popup',
            title : 'Rename',
            caller : { refresh : refreshScreen },
            render : function(popupEl) {
                fn.component.create({ name : 'form', resource : playerResource, data : Object.assign({ id : player.id }, player.data), parent : popupEl.content });
                fn.component.create({ name : 'save-btn', parent : popupEl.content });
            },
        });
    }

    function openEndings() {
        fn.component.create({
            name : 'popup',
            title : 'Endings Reached',
            render : function(popupEl) {
                var storyId = parseHash().storyId;
                var datas = fn.util.selectFlat({ key : 'ending' }).filter(function(e) { return e.storyId === storyId; }).slice().reverse();
                fn.component.create({ name : 'list', resource : endingResource, datas : datas, readonly : true, parent : popupEl.content });
            },
        });
    }

    var bg = '#070b14';
    var panelBg = '#101b33';
    var accent = '#4fd8e8';
    var dim = '#5b6b8c';
    var text = '#e6ecff';
    var appFont = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
    var inputStyle = {
        width : '100%', boxSizing : 'border-box', padding : '8px', font : '14px ' + appFont,
        background : bg, color : text, border : '1px solid ' + dim, borderRadius : '4px',
    };

    fn.component.layout.set({
        name : 'popup',
        layout : function(opt = {}) {
            var popup = fn.element.create({
                tagName : 'div',
                attribute : { class : '__popup' },
                style : {
                    position : 'fixed', top : '16px', left : '50%', transform : 'translateX(-50%)',
                    width : 'calc(100% - 32px)', maxWidth : '340px', maxHeight : 'calc(100% - 32px)', overflowY : 'auto',
                    boxSizing : 'border-box', background : panelBg, color : text,
                    border : '1px solid ' + dim, borderRadius : '6px', font : '14px/1.5 ' + appFont,
                },
            });

            var header = fn.element.create({
                parent : popup, tagName : 'div',
                style : { display : 'flex', justifyContent : 'space-between', alignItems : 'center', padding : '10px 14px', borderBottom : '1px solid ' + dim },
            });
            fn.element.create({ parent : header, tagName : 'div', text : opt.title || 'Popup', style : { fontWeight : '700', color : accent } });
            fn.component.create({ name : 'close-btn', parent : header });

            var content = fn.element.create({ parent : popup, tagName : 'div', style : { padding : '14px' } });

            popup.content = content;
            popup._.resource = opt.resource;
            popup._.data = opt.data;
            popup._.caller = opt.caller;

            if (opt.render) {
                opt.render(popup);
            }

            document.body.appendChild(popup);
            return popup;
        }
    });

    fn.component.layout.set({
        name : 'close-btn',
        layout : function() {
            return fn.element.create({
                tagName : 'button',
                attribute : { type : 'button', title : 'Close' },
                text : '✕',
                style : { background : 'transparent', border : 'none', color : accent, fontSize : '14px', cursor : 'pointer' },
                event : { click : function(e) { e.target.closest('.__popup').remove(); } },
            });
        }
    });

    fn.component.layout.set({
        name : 'save-btn',
        layout : function() {
            return fn.element.create({
                tagName : 'button',
                attribute : { type : 'button', title : 'Save' },
                text : 'Save',
                style : { padding : '8px 16px', marginTop : '12px', width : '100%', background : accent, color : bg, border : 'none', borderRadius : '4px', fontWeight : '700', cursor : 'pointer' },
                event : { click : function(e) {
                    fn.util.saveForm({
                        popup : e.target.closest('.__popup'),
                        onSaved : function(popup) { popup.remove(); },
                    });
                } },
            });
        }
    });

    fn.component.layout.set({
        name : 'form',
        layout : function(opt = {resource : {key : '', columns : []}, data : {}}) {
            var el = fn.element.create({ tagName : 'div', attribute : { class : '__form' }, data : opt.data });
            el._.resource = opt.resource;
            el._.inputs = {};

            opt.resource.columns.forEach(function(column) {
                if (!column.form) {
                    return;
                }
                var field = fn.element.create({ tagName : 'div', style : { marginBottom : '12px' }, parent : el });
                fn.element.create({ tagName : 'div', text : column.label || column.name, style : { marginBottom : '4px', color : dim, fontSize : '12px' }, parent : field });

                var input;
                if (column.form.render) {
                    input = fn.render({ source : column.form.render, data : opt.data });
                    field.appendChild(input);
                } else if (column.form.type === 'select') {
                    input = fn.element.create({ tagName : 'select', attribute : { name : column.name }, style : inputStyle, parent : field });
                    fn.data.select({ key : column.form.resource.key }).forEach(function(row) {
                        fn.element.create({
                            tagName : 'option',
                            attribute : { value : row.id },
                            text : row.data[column.form.resource.label],
                            parent : input,
                        });
                    });
                } else if (column.form.type === 'textarea') {
                    input = fn.element.create({
                        tagName : 'textarea',
                        attribute : column.form.placeholder ? { name : column.name, placeholder : column.form.placeholder } : { name : column.name },
                        style : Object.assign({}, inputStyle, { minHeight : column.form.height || '60px', resize : 'vertical' }),
                        parent : field,
                    });

                    var parsed;
                    try {
                        parsed = JSON.parse(opt.data[column.name]);
                    } catch (e) {
                        parsed = undefined;
                    }
                    if (parsed !== undefined && parsed !== null && typeof parsed === 'object') {
                        var preview = fn.component._.jsonPreview(parsed);
                        fn.component.create({
                            name : 'list',
                            resource : { key : '', columns : preview.columns },
                            datas : preview.datas,
                            readonly : true,
                            parent : field,
                        });
                    }
                } else {
                    input = fn.element.create({
                        tagName : 'input',
                        attribute : column.form.placeholder ? { type : 'text', name : column.name, placeholder : column.form.placeholder } : { type : 'text', name : column.name },
                        style : inputStyle,
                        parent : field,
                    });
                }

                if (input.tagName !== 'BUTTON' && opt.data[column.name] !== undefined) {
                    input.value = column.form.json ? JSON.stringify(opt.data[column.name], null, 2) : opt.data[column.name];
                }
                el._.inputs[column.name] = input;
            });

            el.getData = function() {
                var result = {};
                opt.resource.columns.forEach(function(column) {
                    if (!column.form) {
                        return;
                    }
                    var input = el._.inputs[column.name];
                    if (input.tagName === 'BUTTON') {
                        return;
                    }
                    var value = column.form.resource ? Number(input.value) : input.value;
                    if (column.form.json) {
                        try {
                            value = JSON.parse(value);
                        } catch (e) {
                            value = {};
                        }
                    }
                    result[column.name] = value;
                });
                return result;
            };

            el.save = function() {
                var data = Object.assign({}, el._.data, el.getData());
                delete data.id;
                if (el._.data.id !== undefined) {
                    return fn.data.update({ key : el._.resource.key, id : el._.data.id, data : data });
                }
                return fn.data.insert({ key : el._.resource.key, data : data });
            };

            return el;
        }
    });

    fn.component._.renderListTable = function(opt) {
        var el = fn.element.create({ tagName : 'table', style : { width : '100%', borderCollapse : 'collapse' }, datas : opt.datas });

        var thead = fn.element.create({ tagName : 'thead', parent : el });
        var headRow = fn.element.create({ tagName : 'tr', parent : thead });
        opt.resource.columns.forEach(function(column) {
            if (!column.list) {
                return;
            }
            fn.element.create({
                tagName : 'th',
                text : column.label || column.name,
                style : { textAlign : 'left', padding : '6px 10px', borderBottom : '1px solid ' + dim, color : dim, fontWeight : 'normal' },
                parent : headRow,
            });
        });

        var tbody = fn.element.create({ tagName : 'tbody', parent : el });
        opt.datas.forEach(function(data) {
            var clickable = !!opt.resource.key && !opt.readonly;
            var row = fn.element.create({
                tagName : 'tr',
                style : clickable ? { cursor : 'pointer' } : {},
                data : data,
                parent : tbody,
                event : clickable ? {
                    click : function(e) {
                        fn.component.create({
                            name : 'popup',
                            title : 'Edit',
                            caller : opt.caller || e.target.closest('.__popup'),
                            render : function(popupEl) {
                                fn.component.create({ name : opt.formName || 'form', resource : opt.resource, data : data, parent : popupEl.content });
                                fn.component.create({ name : 'save-btn', parent : popupEl.content });
                            },
                        });
                    }
                } : {},
            });

            opt.resource.columns.forEach(function(column) {
                if (!column.list) {
                    return;
                }
                var cell = fn.element.create({ tagName : 'td', style : { padding : '6px 10px', borderBottom : '1px solid #1c2947' }, parent : row });
                if (column.list.render) {
                    var rendered = fn.render({ source : column.list.render, data : data });
                    if (rendered instanceof HTMLElement) {
                        cell.appendChild(rendered);
                    } else {
                        cell.textContent = rendered;
                    }
                } else if (column.form && column.form.resource && data[column.name] !== undefined) {
                    var referencedRow = fn.data.select({ key : column.form.resource.key, id : data[column.name] });
                    cell.textContent = referencedRow ? referencedRow.data[column.form.resource.label] : data[column.name];
                } else {
                    cell.textContent = data[column.name] !== undefined ? data[column.name] : '';
                }
            });
        });

        return el;
    };

    fn.component.layout.set({
        name : 'list',
        layout : function(opt = {resource : {key : '', columns : []}, datas : []}) {
            var el = fn.element.create({ tagName : 'div', attribute : { class : '__list' }, datas : opt.datas });
            el._.resource = opt.resource;
            el._.caller = opt.caller;
            el._.readonly = opt.readonly;
            el._.formName = opt.formName;
            el._.pageSize = opt.pageSize || 10;
            el._.page = 0;

            el.tableArea = fn.element.create({ tagName : 'div', parent : el });
            el.paginationArea = fn.element.create({ tagName : 'div', parent : el });

            el.refresh = function() {
                var pageCount = Math.max(1, Math.ceil(el._.datas.length / el._.pageSize));
                el._.page = Math.min(el._.page, pageCount - 1);
                var pageDatas = el._.datas.slice(el._.page * el._.pageSize, (el._.page + 1) * el._.pageSize);

                Array.from(el.tableArea.children).forEach(function(child) { child.remove(); });
                el.tableArea.appendChild(fn.component._.renderListTable({
                    resource : el._.resource, datas : pageDatas, caller : el._.caller, readonly : el._.readonly, formName : el._.formName,
                }));

                if (pageCount > 1) {
                    fn.component.refresh({ name : 'pagination', page : el._.page, pageCount : pageCount, parent : el.paginationArea });
                } else {
                    Array.from(el.paginationArea.children).forEach(function(child) { child.remove(); });
                }
            };

            el.refresh();
            return el;
        }
    });

    fn.component.layout.set({
        name : 'pagination',
        layout : function(opt = {}) {
            var bar = fn.element.create({
                tagName : 'div',
                style : { display : 'flex', justifyContent : 'space-between', alignItems : 'center', padding : '8px 0', color : accent },
            });

            fn.element.create({
                tagName : 'button',
                attribute : { type : 'button' },
                text : 'Prev',
                style : { padding : '6px 12px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer', visibility : opt.page > 0 ? 'visible' : 'hidden' },
                event : { click : function(e) {
                    var list = e.target.closest('.__list');
                    list._.page = Math.max(0, list._.page - 1);
                    list.refresh();
                } },
                parent : bar,
            });

            fn.element.create({
                tagName : 'div',
                text : 'Page ' + (opt.page + 1) + ' of ' + opt.pageCount,
                style : { color : dim, fontSize : '13px' },
                parent : bar,
            });

            fn.element.create({
                tagName : 'button',
                attribute : { type : 'button' },
                text : 'Next',
                style : { padding : '6px 12px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer', visibility : opt.page < opt.pageCount - 1 ? 'visible' : 'hidden' },
                event : { click : function(e) {
                    var list = e.target.closest('.__list');
                    var pageCount = Math.max(1, Math.ceil(list._.datas.length / list._.pageSize));
                    list._.page = Math.min(pageCount - 1, list._.page + 1);
                    list.refresh();
                } },
                parent : bar,
            });

            return bar;
        }
    });

    fn.component.layout.set({
        name : 'library',
        layout : function() {
            var player = getPlayer();
            var wrap = fn.element.create({ tagName : 'div', style : { padding : '20px' } });

            var header = fn.element.create({ tagName : 'div', style : { display : 'flex', flexWrap : 'wrap', justifyContent : 'space-between', alignItems : 'center', gap : '8px', marginBottom : '20px' }, parent : wrap });
            fn.element.create({ tagName : 'div', text : 'Branchtale', style : { fontWeight : '700', fontSize : '20px', color : accent }, parent : header });
            var btnRow = fn.element.create({ tagName : 'div', style : { display : 'flex', gap : '8px', alignItems : 'center' }, parent : header });
            fn.element.create({ tagName : 'div', text : player.data.name, style : { fontSize : '12px', color : dim }, parent : btnRow });
            fn.element.create({
                tagName : 'button', attribute : { type : 'button' }, text : 'Rename',
                style : { padding : '8px 12px', fontSize : '13px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer' },
                event : { click : openRename }, parent : btnRow,
            });

            fn.util.newButton({
                text : '+ New Story', title : 'New Story', resource : storyResource,
                data : { author : player.data.name },
                caller : { refresh : function(savedStory) {
                    if (savedStory) {
                        seedStartScene(savedStory.id);
                        location.hash = '#/story/' + savedStory.id + '/editor';
                    } else {
                        refreshScreen();
                    }
                } },
                parent : wrap,
                style : { padding : '10px 16px', width : '100%', marginBottom : '16px', background : accent, color : bg, border : 'none', borderRadius : '4px', fontWeight : '700', cursor : 'pointer' },
            });

            var stories = fn.util.selectFlat({ key : 'story' });
            if (stories.length === 0) {
                fn.element.create({ tagName : 'div', text : 'No stories yet. Click "+ New Story" to write one.', style : { color : dim, fontSize : '13px' }, parent : wrap });
            }
            stories.forEach(function(story) {
                var card = fn.element.create({
                    tagName : 'div',
                    style : { padding : '14px', marginBottom : '10px', background : panelBg, border : '1px solid ' + dim, borderRadius : '6px', cursor : 'pointer' },
                    event : { click : function() { openStory(story.id); } },
                    parent : wrap,
                });
                var cardHeader = fn.element.create({ tagName : 'div', style : { display : 'flex', justifyContent : 'space-between', alignItems : 'flex-start' }, parent : card });
                var titleCol = fn.element.create({ tagName : 'div', parent : cardHeader });
                fn.element.create({ tagName : 'div', text : story.title, style : { fontWeight : '700', fontSize : '16px', color : accent }, parent : titleCol });
                fn.element.create({ tagName : 'div', text : 'by ' + (story.author || 'Anonymous'), style : { fontSize : '11px', color : dim, marginTop : '2px' }, parent : titleCol });
                fn.element.create({
                    tagName : 'button', attribute : { type : 'button' }, text : 'Edit',
                    style : { padding : '4px 10px', fontSize : '11px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer' },
                    event : { click : function(e) {
                        e.stopPropagation();
                        fn.component.create({
                            name : 'popup',
                            title : 'Edit Story',
                            caller : { refresh : refreshScreen },
                            render : function(popupEl) {
                                fn.component.create({ name : 'form', resource : storyResource, data : story, parent : popupEl.content });
                                fn.component.create({ name : 'save-btn', parent : popupEl.content });
                                fn.element.create({
                                    tagName : 'button', attribute : { type : 'button' }, text : 'Delete Story',
                                    style : { padding : '8px 16px', marginTop : '8px', width : '100%', background : 'transparent', color : '#f28b82', border : '1px solid #f28b82', borderRadius : '4px', cursor : 'pointer' },
                                    event : { click : function(e2) {
                                        deleteStory(story.id);
                                        e2.target.closest('.__popup').remove();
                                    } },
                                    parent : popupEl.content,
                                });
                            },
                        });
                    } },
                    parent : cardHeader,
                });
                if (story.description) {
                    fn.element.create({ tagName : 'div', text : story.description, style : { fontSize : '13px', color : text, marginTop : '8px' }, parent : card });
                }
            });

            return wrap;
        }
    });

    fn.component.layout.set({
        name : 'story-body',
        layout : function() {
            var route = parseHash();
            var scene = findScene(route.storyId, route.sceneKey);
            var wrap = fn.element.create({ tagName : 'div' });

            if (!scene) {
                fn.element.create({ tagName : 'div', text : 'Scene Not Found', style : { fontWeight : '700', fontSize : '18px', color : accent, marginBottom : '10px' }, parent : wrap });
                fn.element.create({
                    tagName : 'div', text : 'The scene "' + route.sceneKey + '" doesn\'t exist in this story -- a choice may point to a key that was renamed or never created.',
                    style : { fontSize : '14px', color : dim, marginBottom : '20px' }, parent : wrap,
                });
                fn.element.create({
                    tagName : 'button', attribute : { type : 'button' }, text : 'Back to Start',
                    style : { padding : '10px 16px', width : '100%', background : accent, color : bg, border : 'none', borderRadius : '4px', fontWeight : '700', cursor : 'pointer' },
                    event : { click : function() { goToScene('start'); } },
                    parent : wrap,
                });
                return wrap;
            }

            var choices = getLocalized(scene.choices) || [];

            var langSelect = fn.element.create({
                tagName : 'select',
                style : { padding : '5px 6px', fontSize : '12px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', marginBottom : '16px' },
                event : { change : function(e) { currentLang = e.target.value; refreshScreen(); } },
                parent : wrap,
            });
            Object.keys(scene.title || {}).forEach(function(lang) {
                fn.element.create({ tagName : 'option', attribute : { value : lang }, text : langLabels[lang] || lang, parent : langSelect });
            });
            langSelect.value = currentLang;

            var isEnding = choices.length === 0;
            if (isEnding) {
                fn.element.create({ tagName : 'div', text : getLocalized(scene.endingType), style : { fontSize : '11px', letterSpacing : '2px', color : accent, textTransform : 'uppercase', marginBottom : '6px' }, parent : wrap });
            }

            fn.element.create({ tagName : 'div', text : getLocalized(scene.title), style : { fontWeight : '700', fontSize : '20px', color : accent, marginBottom : '12px' }, parent : wrap });
            fn.element.create({ tagName : 'div', text : getLocalized(scene.text), style : { fontSize : '15px', lineHeight : '1.7', color : text, marginBottom : '24px' }, parent : wrap });

            if (isEnding) {
                fn.element.create({ tagName : 'div', text : 'THE END', style : { fontSize : '12px', letterSpacing : '3px', color : dim, marginBottom : '16px' }, parent : wrap });
                fn.element.create({
                    tagName : 'button', attribute : { type : 'button' }, text : 'Play Again',
                    style : { padding : '10px 16px', width : '100%', background : accent, color : bg, border : 'none', borderRadius : '4px', fontWeight : '700', cursor : 'pointer' },
                    event : { click : function() { goToScene('start'); } },
                    parent : wrap,
                });
                return wrap;
            }

            choices.forEach(function(choice) {
                fn.element.create({
                    tagName : 'button', attribute : { type : 'button' }, text : choice.label,
                    style : {
                        display : 'block', width : '100%', textAlign : 'left', padding : '12px 14px', marginBottom : '10px',
                        background : panelBg, color : text, border : '1px solid ' + dim, borderRadius : '6px',
                        font : '14px ' + appFont, cursor : 'pointer',
                    },
                    event : { click : function() { goToScene(choice.next); } },
                    parent : wrap,
                });
            });

            return wrap;
        }
    });

    // A hand-built alternative to the generic schema-driven `form` for Scene specifically --
    // raw JSON textareas were the only way to enter multi-language title/text/endingType/choices,
    // which is unreadable for a reader who just wants to write a scene. Same contract as `form`
    // (a `.__form` element with a `.save()`), so save-btn/fn.util.saveForm need no changes -- only
    // `fn.util.newButton`/`renderListTable` needed an `opt.formName` to pick this over `form`.
    // Language tabs switch which language's Title/Text/Ending Type/Choices are being edited;
    // `draft` holds every language's fields in memory (mutated live by each input's own
    // listener) so switching tabs never loses unsaved edits, and `.save()` reassembles the
    // `{lang: value}` shape `fn.data`/the reading screen expect from every language in `draft`.
    fn.component.layout.set({
        name : 'scene-form',
        layout : function(opt = { data : {} }) {
            var el = fn.element.create({ tagName : 'div', attribute : { class : '__form' }, data : opt.data });
            el._.data = opt.data;

            var initial = opt.data || {};
            var seenLangs = {};
            [ 'title', 'text', 'endingType', 'choices' ].forEach(function(field) {
                Object.keys(initial[field] || {}).forEach(function(lang) { seenLangs[lang] = true; });
            });
            var langs = Object.keys(seenLangs);
            if (langs.length === 0) {
                langs = [ 'en' ];
            }
            var draft = {};
            langs.forEach(function(lang) {
                draft[lang] = {
                    title : (initial.title || {})[lang] || '',
                    text : (initial.text || {})[lang] || '',
                    endingType : (initial.endingType || {})[lang] || '',
                    choices : ((initial.choices || {})[lang] || []).map(function(c) { return { label : c.label, next : c.next }; }),
                };
            });
            var currentLang = langs[0];
            var datalistId = 'scene-keys-' + Math.random().toString(36).slice(2);

            var datalist = fn.element.create({ tagName : 'datalist', attribute : { id : datalistId }, parent : el });
            fn.util.selectFlat({ key : 'scene' }).filter(function(s) { return s.storyId === initial.storyId; }).forEach(function(s) {
                fn.element.create({ tagName : 'option', attribute : { value : s.key }, parent : datalist });
            });

            var keyField = fn.element.create({ tagName : 'div', style : { marginBottom : '12px' }, parent : el });
            fn.element.create({ tagName : 'div', text : 'Key', style : { marginBottom : '4px', color : dim, fontSize : '12px' }, parent : keyField });
            var keyInput = fn.element.create({ tagName : 'input', attribute : { type : 'text', placeholder : 'e.g. bridge_solo' }, style : inputStyle, parent : keyField });
            keyInput.value = initial.key || '';

            var langTabs = fn.element.create({ tagName : 'div', style : { display : 'flex', flexWrap : 'wrap', gap : '6px', marginBottom : '12px' }, parent : el });
            var bodyArea = fn.element.create({ tagName : 'div', parent : el });

            function tabStyle(isActive) {
                return {
                    padding : '6px 10px', fontSize : '12px', borderRadius : '4px', cursor : 'pointer',
                    background : isActive ? accent : bg, color : isActive ? bg : accent,
                    fontWeight : isActive ? '700' : 'normal', border : '1px solid ' + dim,
                };
            }

            function renderLangTabs() {
                Array.from(langTabs.children).forEach(function(c) { c.remove(); });
                langs.forEach(function(lang) {
                    fn.element.create({
                        tagName : 'button', attribute : { type : 'button' }, text : langLabels[lang] || lang,
                        style : tabStyle(lang === currentLang),
                        event : { click : function() { currentLang = lang; renderLangTabs(); renderBody(); } },
                        parent : langTabs,
                    });
                });
                fn.element.create({
                    tagName : 'button', attribute : { type : 'button' }, text : '+ Language',
                    style : { padding : '6px 10px', fontSize : '12px', borderRadius : '4px', cursor : 'pointer', background : bg, color : dim, border : '1px dashed ' + dim },
                    event : { click : function() {
                        var code = prompt('Language code (e.g. en, ko, ja):');
                        if (!code) {
                            return;
                        }
                        code = code.trim().toLowerCase();
                        if (!code) {
                            return;
                        }
                        if (!draft[code]) {
                            draft[code] = { title : '', text : '', endingType : '', choices : [] };
                            langs.push(code);
                        }
                        currentLang = code;
                        renderLangTabs();
                        renderBody();
                    } },
                    parent : langTabs,
                });
            }

            function renderBody() {
                Array.from(bodyArea.children).forEach(function(c) { c.remove(); });
                var d = draft[currentLang];

                var titleField = fn.element.create({ tagName : 'div', style : { marginBottom : '12px' }, parent : bodyArea });
                fn.element.create({ tagName : 'div', text : 'Title', style : { marginBottom : '4px', color : dim, fontSize : '12px' }, parent : titleField });
                var titleInput = fn.element.create({ tagName : 'input', attribute : { type : 'text' }, style : inputStyle, parent : titleField });
                titleInput.value = d.title;
                titleInput.addEventListener('input', function() { d.title = titleInput.value; });

                var textField = fn.element.create({ tagName : 'div', style : { marginBottom : '12px' }, parent : bodyArea });
                fn.element.create({ tagName : 'div', text : 'Text', style : { marginBottom : '4px', color : dim, fontSize : '12px' }, parent : textField });
                var textInput = fn.element.create({ tagName : 'textarea', style : Object.assign({}, inputStyle, { minHeight : '100px', resize : 'vertical' }), parent : textField });
                textInput.value = d.text;
                textInput.addEventListener('input', function() { d.text = textInput.value; });

                var endingField = fn.element.create({ tagName : 'div', style : { marginBottom : '12px' }, parent : bodyArea });
                fn.element.create({ tagName : 'div', text : 'Ending Type (leave blank if this is not an ending)', style : { marginBottom : '4px', color : dim, fontSize : '12px' }, parent : endingField });
                var endingInput = fn.element.create({ tagName : 'input', attribute : { type : 'text', placeholder : 'e.g. Good Ending' }, style : inputStyle, parent : endingField });
                endingInput.value = d.endingType;
                endingInput.addEventListener('input', function() { d.endingType = endingInput.value; });

                var choicesField = fn.element.create({ tagName : 'div', parent : bodyArea });
                var choicesLabel = fn.element.create({ tagName : 'div', style : { marginBottom : '6px', color : dim, fontSize : '12px' }, parent : choicesField });
                var choicesList = fn.element.create({ tagName : 'div', parent : choicesField });

                function renderChoices() {
                    choicesLabel.textContent = 'Choices' + (d.choices.length === 0 ? ' -- none, so this scene is an ending in ' + (langLabels[currentLang] || currentLang) : '');
                    Array.from(choicesList.children).forEach(function(c) { c.remove(); });
                    d.choices.forEach(function(choice, index) {
                        var row = fn.element.create({ tagName : 'div', style : { marginBottom : '8px', padding : '8px', border : '1px solid ' + dim, borderRadius : '4px' }, parent : choicesList });
                        var labelInput = fn.element.create({ tagName : 'input', attribute : { type : 'text', placeholder : 'Choice label' }, style : Object.assign({}, inputStyle, { marginBottom : '6px' }), parent : row });
                        labelInput.value = choice.label || '';
                        labelInput.addEventListener('input', function() { choice.label = labelInput.value; });

                        var nextRow = fn.element.create({ tagName : 'div', style : { display : 'flex', gap : '6px' }, parent : row });
                        var nextInput = fn.element.create({ tagName : 'input', attribute : { type : 'text', list : datalistId, placeholder : 'Next scene key' }, style : Object.assign({}, inputStyle, { flex : '1', width : 'auto', minWidth : '0' }), parent : nextRow });
                        nextInput.value = choice.next || '';
                        nextInput.addEventListener('input', function() { choice.next = nextInput.value; });

                        fn.element.create({
                            tagName : 'button', attribute : { type : 'button', title : 'Remove choice' }, text : '✕ Remove',
                            style : { padding : '8px 10px', flexShrink : '0', background : bg, color : '#f28b82', border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer' },
                            event : { click : function() { d.choices.splice(index, 1); renderChoices(); } },
                            parent : nextRow,
                        });
                    });
                    fn.element.create({
                        tagName : 'button', attribute : { type : 'button' }, text : '+ Add Choice',
                        style : { padding : '6px 10px', fontSize : '12px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer' },
                        event : { click : function() { d.choices.push({ label : '', next : '' }); renderChoices(); } },
                        parent : choicesList,
                    });
                }

                renderChoices();
            }

            renderLangTabs();
            renderBody();

            el.save = function() {
                var title = {}, sceneText = {}, endingType = {}, choices = {};
                langs.forEach(function(lang) {
                    title[lang] = draft[lang].title;
                    sceneText[lang] = draft[lang].text;
                    endingType[lang] = draft[lang].endingType;
                    choices[lang] = draft[lang].choices.filter(function(c) { return c.label || c.next; });
                });
                var data = Object.assign({}, el._.data, {
                    key : keyInput.value.trim(), title : title, text : sceneText, endingType : endingType, choices : choices,
                });
                delete data.id;
                if (el._.data.id !== undefined) {
                    return fn.data.update({ key : 'scene', id : el._.data.id, data : data });
                }
                return fn.data.insert({ key : 'scene', data : data });
            };

            return el;
        }
    });

    fn.component.layout.set({
        name : 'editor-body',
        layout : function() {
            var storyId = parseHash().storyId;
            var wrap = fn.element.create({ tagName : 'div' });

            var toolRow = fn.element.create({ tagName : 'div', style : { display : 'flex', gap : '8px', marginBottom : '16px', flexWrap : 'wrap', alignItems : 'center' }, parent : wrap });
            fn.util.newButton({
                text : '+ New Scene', title : 'New Scene', resource : sceneResource, formName : 'scene-form',
                data : { storyId : storyId },
                caller : { refresh : refreshScreen }, parent : toolRow,
                style : { padding : '8px 12px', fontSize : '13px', background : accent, color : bg, border : 'none', borderRadius : '4px', fontWeight : '700', cursor : 'pointer' },
            });
            fn.element.create({
                tagName : 'button', attribute : { type : 'button' }, text : 'Check for Loops',
                style : { padding : '8px 12px', fontSize : '13px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer' },
                event : { click : openLoopCheck }, parent : toolRow,
            });
            fn.element.create({
                tagName : 'button', attribute : { type : 'button' }, text : 'Download JSON',
                style : { padding : '8px 12px', fontSize : '13px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer' },
                event : { click : exportStory }, parent : toolRow,
            });
            fn.element.create({
                tagName : 'input',
                attribute : { type : 'file', accept : 'application/json,.json' },
                style : { fontSize : '12px', color : text, maxWidth : '160px' },
                event : { change : function(e) { if (e.target.files[0]) { importStory(e.target.files[0]); } } },
                parent : toolRow,
            });

            var sceneDatas = fn.util.selectFlat({ key : 'scene' }).filter(function(s) { return s.storyId === storyId; });

            var searchInput = fn.element.create({
                tagName : 'input',
                attribute : { type : 'text', placeholder : 'Search scenes by key or title...' },
                style : Object.assign({}, inputStyle, { marginBottom : '12px' }),
                parent : wrap,
            });

            var sceneList = fn.component.create({ name : 'list', resource : sceneResource, datas : sceneDatas, caller : { refresh : refreshScreen }, formName : 'scene-form', pageSize : 8, parent : wrap });

            searchInput.addEventListener('input', function() {
                var q = searchInput.value.trim().toLowerCase();
                sceneList._.datas = !q ? sceneDatas : sceneDatas.filter(function(s) {
                    return s.key.toLowerCase().indexOf(q) !== -1 || getLocalized(s.title).toLowerCase().indexOf(q) !== -1;
                });
                sceneList._.page = 0;
                sceneList.refresh();
            });

            return wrap;
        }
    });

    // The persistent chrome for both Story and Editor: a back-to-Library arrow plus the story
    // title (the one consistent "home" affordance every screen but Library itself has, replacing
    // the old ad hoc Library/Editor/Back-to-Story buttons each screen used to carry separately),
    // Endings/Rename as actions, and a Read/Editor tab row so switching between reading and
    // editing the current story is a tab switch rather than a "go to another screen" jump.
    fn.component.layout.set({
        name : 'story-shell',
        layout : function() {
            var route = parseHash();
            var story = fn.data.select({ key : 'story', id : route.storyId });
            var wrap = fn.element.create({ tagName : 'div', style : { padding : '20px' } });

            var topRow = fn.element.create({ tagName : 'div', style : { display : 'flex', flexWrap : 'wrap', alignItems : 'center', gap : '8px', marginBottom : '16px' }, parent : wrap });
            fn.element.create({
                tagName : 'button', attribute : { type : 'button', title : 'Back to Library' }, text : '← Library',
                style : { padding : '8px 12px', fontSize : '13px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer' },
                event : { click : goToLibrary }, parent : topRow,
            });
            fn.element.create({ tagName : 'div', text : story.data.title, style : { flex : '1', minWidth : '0', fontWeight : '700', fontSize : '15px', color : accent, overflow : 'hidden', textOverflow : 'ellipsis', whiteSpace : 'nowrap' }, parent : topRow });
            fn.element.create({
                tagName : 'button', attribute : { type : 'button' }, text : 'Endings',
                style : { padding : '8px 12px', fontSize : '13px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer' },
                event : { click : openEndings }, parent : topRow,
            });
            fn.element.create({
                tagName : 'button', attribute : { type : 'button' }, text : 'Rename',
                style : { padding : '8px 12px', fontSize : '13px', background : bg, color : accent, border : '1px solid ' + dim, borderRadius : '4px', cursor : 'pointer' },
                event : { click : openRename }, parent : topRow,
            });

            var tabRow = fn.element.create({ tagName : 'div', style : { display : 'flex', gap : '8px', marginBottom : '20px' }, parent : wrap });
            [ { label : 'Read', tabMode : 'story', onClick : closeEditor }, { label : 'Editor', tabMode : 'editor', onClick : openEditor } ].forEach(function(tab) {
                var isActive = route.mode === tab.tabMode;
                fn.element.create({
                    tagName : 'button', attribute : { type : 'button' }, text : tab.label,
                    style : {
                        flex : '1', padding : '10px', fontSize : '13px', borderRadius : '4px', cursor : 'pointer',
                        background : isActive ? accent : bg, color : isActive ? bg : accent,
                        fontWeight : isActive ? '700' : 'normal', border : '1px solid ' + dim,
                    },
                    event : { click : tab.onClick }, parent : tabRow,
                });
            });

            fn.component.create({ name : route.mode === 'editor' ? 'editor-body' : 'story-body', parent : wrap });

            return wrap;
        }
    });

    fn.component.layout.set({
        name : 'game',
        layout : function(opt = {}) {
            playerResource = opt.playerResource;
            storyResource = opt.storyResource;
            endingResource = opt.endingResource;
            sceneResource = opt.sceneResource;
            playerId = opt.playerId;

            var shell = fn.element.create({
                tagName : 'div',
                style : { maxWidth : '480px', margin : '0 auto', minHeight : '100vh', background : bg, color : text, font : '14px/1.5 ' + appFont },
            });

            routeEl = fn.util.route({
                resolve : function() { return parseHash().mode === 'library' ? 'library' : 'story-shell'; },
                parent : shell,
            });

            return shell;
        }
    });
})();
