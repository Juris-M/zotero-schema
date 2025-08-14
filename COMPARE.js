var fs = require("fs");
var path = require("path");

var ztxt = fs.readFileSync("schema.json");
var jtxt = fs.readFileSync("schema-jurism.json");
var ptxt = fs.readFileSync("schema-jurism-patch.json");

var zobj = JSON.parse(ztxt);
var jobj = JSON.parse(jtxt);
var patch = JSON.parse(ptxt);

/*
  So ... what output do I need from this?

  Sources
    schema-jurism.patch
        TYPES: preload this data, and remove where
        a match is found, since native Zotero and native
        Jurism can be compared.

        CREATORS: extended creator types for specific Jurism
        item types. These can be derived from z and j schema.json.

        FIELDS: extended fields for specific item types. These
        can be derived from z and j schema.json.

        SEQUENCE: display order of item type fields. This can
        be derived from the j schema.json, with warnings listed
        to console for fields added by z schema.json.

        CSL_FIELDS: these can just be copied across to the
        new patch file.

        CSL_DATES: these extensions can just be copied across
        to the new patch file.

        CSL_NAMES: this empty object can just be copied across
        to the new patch file.
    
 */


function KeyCheck () {

    this.itemTypeNames = (zobj, jobj) => {
        var ret = {};
        for (let idx=0; idx<zobj.itemTypes.length; idx++) {
            ret[zobj.itemTypes[idx].itemType] = {zotero: idx};
        }
        for (let idx=0; idx<jobj.itemTypes.length; idx++) {
            if (!ret[jobj.itemTypes[idx].itemType]) {
                ret[jobj.itemTypes[idx].itemType] = {};
            }
            ret[jobj.itemTypes[idx].itemType].jurism = idx;
        }
        return ret;
    };

    this.creatorNames = (zIT, jIT) => {
        var ret = {};
        for (let idx=0; idx<zIT.creatorTypes.length; idx++) {
            ret[zIT.creatorTypes[idx].creatorType] = {zotero: idx};
        }
        for (let idx=0; idx<jIT.creatorTypes.length; idx++) {
            if (!ret[jIT.creatorTypes[idx].creatorType]) {
                ret[jIT.creatorTypes[idx].creatorType] = {};
            }
            ret[jIT.creatorTypes[idx].creatorType].jurism = idx;
        }
        return ret;
    };

    this.fieldNames = (zIT, jIT) => {
        var ret = {};
        for (let idx=0; idx<zIT.fields.length; idx++) {
            ret[zIT.fields[idx].field] = {zotero: idx};
        }
        for (let idx=0; idx<jIT.fields.length; idx++) {
            if (!ret[jIT.fields[idx].field]) {
                ret[jIT.fields[idx].field] = {};
            }
            ret[jIT.fields[idx].field].jurism = idx;
        }
        return ret;
    };

    this.getItemPairs = (key) => {
        var ret = {};
        var zITidx = this.typeIdx[key].zotero;
        var jITidx = this.typeIdx[key].jurism;
        // If a type is completely new in Zotero (like dataset),
        // there won't be any Jurism extensions.
        if (jITidx) {
            ret.zotero = zobj.itemTypes[zITidx];
            ret.jurism = jobj.itemTypes[jITidx];
        } else {
            ret = false;
        }
        return ret;
    };
    
    this.walkish = (zobj, jobj, patch) => {
        this.typeIdx = this.itemTypeNames(zobj, jobj);

        this.forTYPES = (zobj, jobj, patch) => {
            var adoptedByZotero = {};
            // For item types adopted by Zotero, remove them
            // from the TYPES patch, but make a note of the
            // base type of each, so that we can be sure all
            // fields are included when we later process FIELDS.
            for (let k in patch.TYPES) {
                if (this.typeIdx[k].zotero !== undefined) {
                    adoptedByZotero[k] = patch[k];
                }
            }
            for (let k in adoptedByZotero) {
                delete patch.TYPES[k];
            }
            // For each of our remaining Jurism extended types,
            // add them to zobj with a copy of their base type,
            // for use in creator and field comparisons.
            for (let k in patch.TYPES) {
                var baseType = patch.TYPES[k].zotero;
                let idx = this.typeIdx[baseType].zotero;
                let typeCopy = JSON.parse(JSON.stringify(zobj.itemTypes[idx]));
                typeCopy.itemType = k;
                zobj.itemTypes.push(typeCopy);
                this.typeIdx[k].zotero = (zobj.itemTypes.length - 1);
            }
        };

        this.forCREATORS = (zobj, jobj) => {
            var ret = {};
            for (let k in this.typeIdx) {
                var itemPair = this.getItemPairs(k);
                if (itemPair) {

                    var creatorIdx = this.creatorNames(itemPair.zotero, itemPair.jurism);
                    
                    for (let j in creatorIdx) {
                        if (creatorIdx[j].zotero === undefined) {
                            if (!ret[k]) {
                                ret[k] = [];
                            }
                            ret[k].push(j);
                        }
                    }
                }
            }
            patch.CREATORS = ret;
        };

        this.forFIELDS = (zobj, jobj, patch) => {
            var ret = {};
            for (let k in this.typeIdx) {
                var itemPair = this.getItemPairs(k);
                if (itemPair) {
                    var fieldIdx = this.fieldNames(itemPair.zotero, itemPair.jurism);

                    for (let j in fieldIdx) {
                        if (fieldIdx[j].zotero === undefined) {
                            if (patch.DATES[k] && patch.DATES[k].indexOf(j) > -1) continue;
                            // I think we just copy the field spec into ret,
                            // as the new patch spec? If fields are found to
                            // be present in new Zotero, they'll be dropped,
                            // which is the only adjustment needed for this one.
                            if (!ret[k]) {
                                ret[k] = [];
                            }
                            ret[k].push(JSON.parse(JSON.stringify(itemPair.jurism.fields[fieldIdx[j].jurism])));
                        }
                    }
                }
            }
            patch.FIELDS = ret;
        };
        
        this.forSEQUENCE = (zobj, jobj, patch) => {
            var ret = {};
            for (let k in this.typeIdx) {
                var itemType = zobj.itemTypes[this.typeIdx[k].zotero];
                var fields = itemType.fields;
                for (let fieldInfo of fields) {
                    var field = fieldInfo.field;
                    if (!patch.SEQUENCE[k] || patch.SEQUENCE[k].indexOf(field) == -1) {
                        if (!ret[k]) {
                            ret[k] = [];
                        }
                        ret[k].push(field);
                    }
                }
            }
            console.log(`Fields missing from SEQUENCE spec:\n${JSON.stringify(ret, null, 2)}`);
        };
        
        this.forTYPES(zobj, jobj, patch);
        this.forCREATORS(zobj, jobj, patch);
        this.forFIELDS(zobj, jobj, patch);
        // DATES is fine.
        this.forSEQUENCE(zobj, jobj, patch);
        // CSL_FIELDS is fine.
        // CSL_DATES is fine.
        // CSL_NAMES is fine.

        return patch;
    };
}

var keys = new KeyCheck();

var ret = keys.walkish(zobj, jobj, patch);

fs.writeFileSync("schema-jurism-patch-new.json", JSON.stringify(ret, null, 2))
