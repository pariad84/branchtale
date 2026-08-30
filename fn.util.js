// Shared logic every example needs identically, unlike fn.component.layout.js (which is a
// reference *visual* implementation examples are meant to diverge from). This file holds no
// styling and no layout registrations of its own -- just the pure CRUD/UI-wiring logic that was
// getting copy-pasted verbatim into every example's app.js/layout.js, which is exactly where the
// framework/app split calls for a shared helper (see "Structural consistency" in CLAUDE.md).
(function() {
    var fn = window.fn;
    fn.util = {};

    // Was duplicated as contactDatas()/dealDatas()/folderDatas()/fileDatas()/noteDatas() (etc.)
    // in every example's app.js -- fn.data.select returns {id, data} rows; every list/form
    // needs the flattened {id, ...data} shape instead.
    fn.util.selectFlat = function(opt) {
        return fn.data.select({ key : opt.key }).map(function(row) {
            return Object.assign({ id : row.id }, row.data);
        });
    };

    // Was duplicated as newButton() in every example's app.js -- opens a popup with a blank
    // form + save-btn for the given resource. opt.style is the one thing that's expected to
    // differ per example's visual theme; everything else about "open an add form" is identical.
    // opt.data optionally presets fields the new row should carry beyond what the form itself
    // collects (e.g. a parent id the user never sees a field for) -- branchtale's Editor uses
    // this to stamp a new Scene with the Story it belongs to. opt.formName picks a resource-
    // specific form layout instead of the generic schema-driven `form` (branchtale's Scene uses
    // its own `scene-form` instead of raw JSON fields) -- any layout named here just needs to
    // build a `.__form` element with a `.save()`, same contract as `form`.
    fn.util.newButton = function(opt) {
        return fn.element.create({
            tagName : 'button',
            attribute : { type : 'button' },
            text : opt.text,
            style : opt.style,
            parent : opt.parent,
            event : {
                click : function() {
                    fn.component.create({
                        name : 'popup',
                        title : opt.title,
                        caller : opt.caller,
                        render : function(popupEl) {
                            fn.component.create({ name : opt.formName || 'form', resource : opt.resource, data : opt.data || {}, parent : popupEl.content });
                            fn.component.create({ name : 'save-btn', parent : popupEl.content });
                        },
                    });
                }
            },
        });
    };

    // Was duplicated inside every example's own save-btn layout -- calls the popup's .__form's
    // own .save() (insert-or-update is the form's business, since it's the form that knows its
    // resource/data -- see the `form` layout in any example's layout.js), then refreshes the
    // caller. Only "how the popup/window/screen closes" is expected to differ per example's
    // chrome, so that part stays a callback (opt.onSaved), not something this helper decides.
    // The saved row is passed to both, since a caller may need it (branchtale's "+ New Story"
    // jumps straight into editing the row it just created).
    fn.util.saveForm = function(opt) {
        var popup = opt.popup;
        var form = popup.querySelector('.__form');
        var saved = form.save();
        if (popup._.caller) {
            popup._.caller.refresh(saved);
        }
        if (opt.onSaved) {
            opt.onSaved(popup, saved);
        }
    };

    // Ported from mini-framework (#27, "Make the back button work"), same as it landed there:
    // read location.hash, look up or resolve which layout that hash means, refresh it into
    // opt.parent, and do it again on every hashchange (a browser back/forward press fires
    // hashchange like any other navigation, which is the whole point: routes are real history
    // entries, so the back button steps through them instead of leaving the app). opt.routes is
    // a flat {hash: layoutName} map for a fixed small set of screens; opt.resolve(hash) is a
    // function instead, for a hash that carries a variable id/key (branchtale's
    // '#/story/<id>/scene/<key>') and so can't be a finite lookup table. Only one of the two is
    // expected per call. Popups/edit-forms are never routed, matching every other example --
    // only real screen-level navigation (which story, which scene, Read vs Editor) is.
    // The returned element's own .refresh() re-runs the same resolve-and-render step without
    // requiring a hash change first, for updates that affect what the current route displays but
    // aren't a navigation (a language switch, a scene just saved) -- the same "refresh in place"
    // shape as a `list` element, and reusable directly as a caller.
    fn.util.route = function(opt) {
        var el = fn.element.create({ tagName : 'div', parent : opt.parent });
        el.refresh = function() {
            var name = opt.resolve ? opt.resolve(location.hash) : (opt.routes[location.hash] || opt.routes[opt.defaultHash || '#/']);
            fn.component.refresh({ name : name, parent : el });
            if (opt.onRoute) {
                opt.onRoute(location.hash);
            }
        };
        window.addEventListener('hashchange', el.refresh);
        el.refresh();
        return el;
    };
})();
