var DEFAULT_DICT_ID = 'dummy';
if (typeof DICT_ID === 'undefined' || !DICT_ID) {
    DICT_ID = DEFAULT_DICT_ID;
}

var App = window.App = {};

App.QUERY_URL = '/api/v1/dictionaries/' + DICT_ID + '/words';
App.ENTRY_URL = '/api/v1/dictionaries/' + DICT_ID + '/entries';
App.MAX_RECENT = 25;

App.Router = Backbone.Router.extend({
    routes: {
        "words/:word": "words",
        "entries/*entry_id": "getEntry"
    },
    words: function (word) {
        App.form.words(word);
    },
    getEntry: function (entry_id) {
        App.form.getEntry(entry_id);
    }
});

App.Form = Backbone.View.extend({
    el: '#main-content',
    events: {
        'keypress .search-query': 'searchOnEnter',
        'click .search': 'searchBtn',
        'click .reset': 'resetBtn'
    },
    initialize: function (options) {
        this.recentList = options.recentList;
        this.input = this.$('.search-query');
        this.results = this.$('.results');
    },
    resetBtn: function (e) {
        e.preventDefault();
        this.input.val('');
        this.input.focus();
    },
    searchBtn: function (e) {
        e.preventDefault();
        this.search();
    },
    searchOnEnter: function (e) {
        if (e.keyCode != 13) return;
        e.preventDefault();
        this.search();
    },
    search: function () {
        var word = this.input.val();
        if (word) {
            this.words(word);
        }
    },
    words: function (word) {
        App.router.navigate('words/' + word);
        var url = App.QUERY_URL + "/" + word;

        this.input.val('');

        $('.loading').removeClass('loading-hidden');
        $.ajax({
            url: url,
            data: {
                similar: true
            },
            success: _.bind(_.partial(this.onApiSuccess, word), this),
            error: _.bind(_.partial(this.onApiError, url), this)
        });
    },
    getEntry: function (entry_id) {
        var url = App.ENTRY_URL + "/" + entry_id;

        this.input.focus();

        $('.loading').removeClass('loading-hidden');
        $.ajax({
            url: url,
            success: _.bind(_.partial(this.onApiSuccess, null), this),
            error: _.bind(_.partial(this.onApiError, url), this)
        });
    },
    onApiSuccess: function (word, json) {
        $('.loading').addClass('loading-hidden');
        $('.api-error').addClass('api-error-hidden');

        var $results = this.results;
        var recentList = this.recentList;
        var entries = json.matches[0].entries;
        var $noMatches = $('.no-matches');
        if (!entries.length) {
            $noMatches.removeClass('no-matches-hidden');
            return;
        }
        $noMatches.addClass('no-matches-hidden');

        function render_subscripts(str) {
            return str.replace(/-(\d+)/, '<sub>$1</sub>');
        }

        var noExactMatches = word && word != entries[0].name.substr(0, word.length);

        if (entries.length) {
            $results.empty();
            _.each(entries, function (entry) {
                var name = render_subscripts(entry.name);
                if (!noExactMatches) {
                    recentList.addCustom({
                        name: name,
                        entry_id: entry.id
                    });
                }
                $results.append($('<h3/>').append(name));
                var refs_links = {};
                _.each(entry.references, function (ref) {
                    var parts = ref.split(':');
                    var ref_name = render_subscripts(parts[2]);
                    refs_links[ref] = $('<a/>').append(ref_name).attr('href', '#entries/' + parts[1]).prop('outerHTML');
                });
                var dl = $('<dl/>');
                _.each(entry.content, function (item) {
                    var dt = item[0];
                    var dd = item[1];
                    dd = dd.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    dd = dd.replace(/\*(.*?)\*/g, '<em>$1</em>');
                    dd = render_subscripts(dd);
                    _.each(entry.references, function (ref, i) {
                        var pattern = "\\[.*?\\]\\[" + (parseInt(i) + 1) + "\\]";
                        dd = dd.replace(new RegExp(pattern, "g"), refs_links[ref]);
                    });
                    dl.append($('<dt/>').append(dt));
                    dl.append($('<dd/>').append(dd));
                });
                $results.append(dl);
            });
        }

        if (noExactMatches) {
            var items = [];
            _.each(entries, function (entry) {
                items.push(new App.Entry({
                    entry_id: entry.id,
                    name: render_subscripts(entry.name)
                }));
            });
            App.similarList.reset(items);
        }
    },
    onApiError: function (url, jqXHR, textStatus, statusText) {
        $('.loading').addClass('loading-hidden');
        var $apiError = $('.api-error');
        $apiError.removeClass('api-error-hidden');
        $apiError.find('a').attr('href', url).text(url);
        $apiError.find('.statusNum').text(jqXHR.status);
        $apiError.find('.statusText').text(statusText);
    }
});

App.Entry = Backbone.Model.extend({
    defaults: {
        entry_id: null,
        name: null
    }
});

App.RecentList = Backbone.Collection.extend({
    model: App.Entry,
    localStorage: new Store('webdict-backbone-' + DICT_ID),
    addCustom: function (obj) {
        var filter = function (item) {
            return item.get('entry_id') == obj.entry_id;
        };
        var remove = function (item) {
            item.destroy();
        };
        _.each(this.filter(filter), remove);

        this.create(obj);

        var excessItemsNum = this.length - App.MAX_RECENT;
        if (excessItemsNum > 0) {
            _.each(this.toArray().slice(0, excessItemsNum), remove);
        }

        this.trigger('updated');
    }
});

App.SimilarList = Backbone.Collection.extend({
    model: App.Entry
});

App.EntryView = Backbone.View.extend({
    tagName: 'tr',
    template: _.template($('#entry-template').html()),
    initialize: function () {
        this.model.bind('destroy', this.remove, this);
    },
    render: function () {
        this.$el.html(this.template(this.model.toJSON()));
        var href = this.$('a').attr('href');
        this.$('td').click(function (e) {
            e.preventDefault();
            App.router.navigate(href, {trigger: true});
        });
        return this;
    },
    clear: function () {
        this.model.clear();
    }
});

App.RecentListView = Backbone.View.extend({
    el: '#recent',
    initialize: function (options) {
        this.list = options.list;
        this.list.bind('reset', this.render, this);
        this.list.bind('updated', this.render, this);
        this.list.fetch();
    },
    render: function () {
        this.$('.recent-list').empty();
        this.list.each(this.add);
        if (this.list.length) {
            this.$el.removeClass('hidden');
        }
    },
    add: function (entry) {
        var view = new App.EntryView({model: entry});
        this.$('.recent-list').prepend(view.render().el);
    }
});

App.SimilarListView = Backbone.View.extend({
    el: '#similar',
    initialize: function (options) {
        this.list = options.list;
        this.list.bind('reset', this.render, this);
    },
    render: function () {
        this.$('.similar-list').empty();
        this.list.each(this.add);
        if (this.list.length) {
            this.$el.removeClass('hidden');
        }
    },
    add: function (entry) {
        var view = new App.EntryView({model: entry});
        this.$('.similar-list').append(view.render().el);
    },
    events: {
        'click .dismiss': 'dismiss'
    },
    dismiss: function () {
        this.$el.addClass('hidden');
        App.form.input.focus();
    }
});

function onDomReady() {
    App.recentList = new App.RecentList();
    App.recentListView = new App.RecentListView({
        list: App.recentList
    });

    App.similarList = new App.SimilarList();
    App.similarListView = new App.SimilarListView({
        list: App.similarList
    });

    App.form = new App.Form({
        recentList: App.recentList
    });
    App.form.input.focus();

    App.router = new App.Router();

    Backbone.history.start();

    if (!window.location.hash) {
        App.form.words('chair');
    }
}

$(function () {
    onDomReady();
});
