// We assume we're running at document idle, meaning we can process the content
// straight away.

"use strict";

var keys = Object.keys.bind(Object);

var toArray = function(listLike) {
  return Array.prototype.slice.call(listLike);
};

var itemsArray = function(obj) {
  return keys(obj).map(function(k) {
    var r = {};
    r.key = k;
    r.value = obj[k];
    return r;
  });
};

var forIn = function(obj, func, scope) {
  keys(obj).forEach(function(key) {
    func.call(this, key, obj[key], obj);
  }, scope||this);
  return obj;
};

var DataSet = function() {
  this.metaData = {};
  this.data = {};
  this.total = 0;
}
DataSet.prototype = {
  merge: function(dsOrObj) {
    forIn(dsOrObj.data, function(key, value) {
      this.increment(key, value);
    }, this);
    forIn(dsOrObj.metaData, function(key, value) {
      this.incrementMeta(key, value);
    }, this);
  },

  incrementMeta: function(name, by) {
    by = by||1;
    this.metaData[name] = (typeof this.metaData[name] == "undefined") ?
                      by : (this.metaData[name] + by);
  },
  increment: function(name, by) {
    by = by||1;
    this.total += by;
    this.data[name] = (typeof this.data[name] == "undefined") ?
                      by : (this.data[name] + by);
  },
  maxSummaryItems: 10,
  get summary() {
    var ret = {
      top: [],
      metaData: itemsArray(this.metaData),
    };
    // Try to do a generic summary. Top 10, whatevs.
    ret.top = itemsArray(this.data);
    ret.top.sort(function(a, b) {
      return b.value - a.value;
    });
    ret.top.length = Math.min(ret.top.length, this.maxSummaryItems);

    // Hook for extended summary generation.
    if (typeof this["summarize"] == "function") {
      return this.summarize(ret);
    }

    return ret;
  },
  toJSON: function() {
    return {
      data: this.data,
      total: this.total,
      metaData: this.metaData,
      summary: this.summary
    };
  }
};

var elements = function() {
  return toArray(document.getElementsByTagName("*"));
};

var schemaDotOrgType = function(e) {
  var type;
  var av = (e.getAttribute("itemscope")||"").toLowerCase();
  if (av) {
    type = e.getAttribute("itemtype");
    if (type) {
      type = (type.split("/").pop() || "unknown");
    }
  }
  return type;
};

var microFormatType = function(el) {
  // FIXME(slightyoff): should be trying to do a tighter fit for some of the
  // parent/child relationships. I.e., only match geo if there's a child with a
  // "latitude" or "longitude" class.
  var v1Tests = {
    hCard: { class: [ "vcard" ] },
    hCal: { class: [ "vevent" ] },
    relLicense: { rel: [ "license" ] },
    noFollow: { rel: [ "nofollow" ] },
    relTag: { rel: [ "tag" ] },
    XFN: { rel: [
      "friend", "acquaintance", "contact", "met", "co-worker", "colleague",
      "co-resident", "neighbor", "child", "parent", "sibling", "spouse", "kin",
      "muse", "crush", "date", "sweetheart", "me" ] },
    xoxo: { class: [ "xoxo" ] },
    adr: { class: [ "adr" ] },
    geo: { class: [ "geo" ] },
    hAtom: { class: [ "hfeed", "hentry" ] },
    hListing: { class: [ "hlisting" ] },
    hMedia: { class: [ "hmedia" ] },
    hNews: { class: [ "hnews" ] },
    hProduct: { class: [ "hproduct" ] },
    hRecipe: { class: [ "hrecipe" ] },
    hResume: { class: [ "hresume" ] },
    hReview: { class: [ "hreview" ] },
    hReviewAggregate: { class: [ "hreview-aggregate" ] },
    relAuthor: { rel: [ "author" ] },
    relHome: { rel: [ "home" ] },
    relPayment: { rel: [ "payment" ] },
  };

  var has = function(el, attr, values) {
    var av = (el.getAttribute(attr)||"").toLowerCase();
    return values.some(
      ((attr == "class") ?
          function(v) { return el.classList.contains(v); } :
          // We assume full string match. FIXME?
          function(v) { return (av == v); }
      )
    );
  };

  var type;

  forIn(v1Tests, function(name, test) {
    forIn(test, function(attr, values) {
      if (has(el, attr, values)) {
        type = name;
        // dataSet.increment(name);
      }
    });
  });

  // Look for "h-*" classes
  toArray(el.classList).some(function(c) {
    var t = (c.indexOf("h-") == 0);
    if (t) {
      type = c;
    }
    return t;
  });

  return type;
};

var ariaType = function(e) {
  var type;
  var av = (e.getAttribute("role")||"").toLowerCase();
  if (av) { type = av; }
  return type;
};

var semanticHtmlType = function(e) {
  var semanticTags = [
    "a", "abbr", "acronym", "address", "article", "aside", "bdi", "bdo",
    "blockquote", "body", "button", "caption", "cite", "code", "col",
    "colgroup", "command", "data", "datalist", "dd", "details", "dfn", "dir",
    "div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure",
    "font", "footer", "form","h1", "h2", "h3", "h4", "h5", "h6", "header",
    "hgroup", "hr", "input", "ins", "kbd", "keygen", "label", "legend", "li",
    "link", "main", "mark", "menu", "meta", "nav", "noscript", "ol", "optgroup",
    "option", "output", "p", "pre", "progress", "q", "rp", "rt", "ruby", "s",
    "samp", "script", "section", "select", "source", "span", "strong", "style",
    "sub", "summary", "sup", "table", "tbody", "td", "textarea", "tfoot", "th",
    "thead", "time", "title", "tr", "track", "ul", "var", "wbr"
 ];
};

var PageData = function(elements) {
  this.total = 0;
  this.tags = new DataSet();
  this.schemaDotOrgItems = new DataSet();
  this.microformatItems = new DataSet();
  this.ariaItems = new DataSet();

  if (elements) {
    this.process(elements);
  }
};
PageData.prototype = {
  process: function(elements) {
    this.total = elements.length;
    elements.forEach(function(e) {
      var tn = e.tagName.toLowerCase()
      this.tags.increment(tn);
      this.tags.incrementMeta(
        (e instanceof HTMLUnknownElement) ? "nonStandard" : "standard");

      var mft = microFormatType(e);
      if (mft) {
        this.microformatItems.increment(mft);
      }

      var sdot = microFormatType(e);
      if (sdot) {
        this.schemaDotOrgItems.increment(sdot);
      }

      var at = ariaType(e);
      if (at) {
        this.ariaItems.increment(at);
      }
    }, this);
  }
};
