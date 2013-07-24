exports = rdf = function() {
    this.co = 'http://www.cropontology.org/';
    this.uri = this.co + 'rdf/';

    this.turtle = '';
};
rdf.prototype.findLangs = function(value) {
    try {
        var obj = JSON.parse(value);
    } catch(e) {
        return { "english": value };
    }
    return obj;
}
rdf.prototype.convertId = function(id) {
    function idUrl() { return arguments[1].toUpperCase(); };
    id = id.replace(/ (.)/g, idUrl);
    id = id.replace(/\(|\)|,|&|\/| |%/g, '');
    return id;
}
rdf.prototype.buildTriple = function(term) {
    var names = this.findLangs(term.name);
    if(term.relationship == 'scale_of' || term.relationship == 'method_of') {
        return;
    }
    
    // let's escape the ID
    term.id = encodeURIComponent(term.id);
    term.parent = encodeURIComponent(term.parent);

    this.turtle += '<' + this.uri + term.id + '> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2004/02/skos/core#Concept> .\n';
    
    // do name
    for(var i in names) {
        var jsonName = JSON.stringify(names[i]);
        if(jsonName != undefined) {
            this.turtle += '<' + this.uri + term.id + '> <http://www.w3.org/2000/01/rdf-schema#label> ' + jsonName + '@' + languages.getIso[i].toLowerCase() + ' .\n';
        }
    }

    // do description
    if(term.description) {
        var desc = this.findLangs(term.description);
    } else if(term['Description of Trait']) {
        var desc = this.findLangs(term['Description of Trait']);
    } else if(term['Describe how measured (method)']) {
        var desc = this.findLangs(term['Describe how measured (method)']);
    } else { // no descritption
        var desc = {};
    }
    for(var i in desc) {
        var jsonDesc = JSON.stringify(desc[i]);
        if(jsonDesc != undefined) {
            this.turtle += '<' + this.uri + term.id + '> <http://www.w3.org/2000/01/rdf-schema#comment> ' + jsonDesc + '@' + languages.getIso[i].toLowerCase() + ' .\n';
        }
    }

    // broader
    if(term.parent != 'null') {
        this.turtle += '<' + this.uri + term.id + '> <http://www.w3.org/2004/02/skos/core#broaderTransitive> <' + this.uri + term.parent + '> .\n';
    }

    return this.turtle;
}

rdf.prototype.buildNtriples = function(ontologyId) {
    var that = this;

    select('term')
        .find({ 
            ontology_id: ontologyId
        })
        .sort('id', 'DESC')
        .each(function() {
            that.buildTriple(this);
            /*
            if(this.relationship) {
                that.buildProperty(this);
            } else {
                that.buildClass(this);
            }
            */
        });

    return this.turtle;
};
