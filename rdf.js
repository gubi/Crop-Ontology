importPackage(org.apache.commons.io);
importPackage(com.hp.hpl.jena.rdf.model);
importPackage(com.hp.hpl.jena.rdf.model.impl);
importPackage(com.hp.hpl.jena.query);
importPackage(com.hp.hpl.jena.update);
importPackage(org.apache.jena.riot);
importPackage(org.apache.jena.riot.system);
importPackage(org.apache.jena.riot.out);
importPackage(org.obolibrary.obo2owl);
importPackage(org.obolibrary.oboformat.model);
importPackage(org.obolibrary.oboformat.parser);
importPackage(org.semanticweb.owlapi.model);
importPackage(org.semanticweb.owlapi.io);

var rdfPath = getServletConfig().getServletContext().getInitParameter('rdf-path');
exports = {
    baseUri: 'http://www.cropontology.org/rdf/',
    prefixes: {
        'foaf': 'http://xmlns.com/foaf/0.1/',
        'co': 'http://www.cropontology.org/rdf/',
        'cov': 'http://www.cropontology.org/vocab/',
        'owl': 'http://www.w3.org/2002/07/owl#',
        'skos': 'http://www.w3.org/2004/02/skos/core#',
        'skosxl': 'http://www.w3.org/2008/05/skos-xl#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'dc': 'http://purl.org/dc/elements/1.1/',
        'dct': 'http://purl.org/dc/terms/',
        'xsd': 'http://www.w3.org/2001/XMLSchema#',
        'dwc': 'http://rs.tdwg.org/dwc/terms/'
    },
    prefixURI: function(uri) {
        for(var i in rdf.prefixes) {
            var prefixVal = rdf.prefixes[i];
            if(uri.indexOf(prefixVal) == 0) { // starts with
                return uri.replace(prefixVal, i + ':');
            }
        }
        // hrm no prefix available, shorten the URI?
        return uri;
    },
    buildSparqlPrefixes: function() {
        var str = '';
        for(var i in this.prefixes) {
            str += 'PREFIX '+i+': <'+this.prefixes[i]+'>\n';
        }
        return str;
    },
    convert: function(baseUri, fileName, inpStream, outputStream, langOut) {
        var lang = RDFLanguages.filenameToLang(fileName);
        var model = ModelFactory.createDefaultModel();

        if(lang != null) {
            lang = lang.getLabel(); 
        }

        model.read(inpStream, baseUri, lang);
        model.write(outputStream, langOut.toUpperCase());

        //IOUtils.copy(inpStream, outputStream);
    },
    // cb() is cb(triple)
    parse: function(inputStream, fileName, baseUri, cb) {
        var lang = RDFLanguages.filenameToLang(fileName);
        var model = ModelFactory.createDefaultModel();

        if(lang != null) {
            lang = lang.getLabel(); 
        }

        model.read(inputStream, baseUri, lang);

        for(var iter = model.listStatements(); iter.hasNext(); ) {
            var elem = iter.next();
            cb(elem.asTriple());
        }
    },
    // gets all files and sub-files
    getAllFiles: function(dir, ret) {
        var ret = ret || [];
        var files = dir.listFiles();
        for(var i=0; i<files.length; i++) {
            var f = files[i];
            if(f.isDirectory()) {
                rdf.getAllFiles(f, ret);
            } else {
                ret.push(f);
            }
        }
        return ret;
    },
    createPath: function(filePath) {
        var file = new File(rdfPath + filePath);
        if(!file.exists()) {
            // create intermediate paths
            file.getParentFile().mkdirs();
            file.createNewFile();
        }
    },
    createModel: function(inputStream, fileName, baseUri) {
        var lang = RDFLanguages.filenameToLang(fileName);
        var model = ModelFactory.createDefaultModel();
        if(lang != null) {
            lang = lang.getLabel(); 
        }
        model.read(inputStream, baseUri, lang);
        return model;
    },
    createModelFrom: function(filePath) {
        var filePath = rdfPath + filePath;
        var file = new File(filePath);
        if(file.isDirectory()) { 
            // get all files (and subfiles) within this dir
            var files = rdf.getAllFiles(file);

            // create a model
            // and read() all these files
            var model = ModelFactory.createDefaultModel();
            for(var i=0; i<files.length; i++) {
                var f = files[i];
                var lang = RDFLanguages.filenameToLang(f.getName());
                if(lang != null) {
                    lang = lang.getLabel(); 
                }
                if(lang) {
                    // this means it's RDF, do the model.read stuff
                    var inputStream = new FileInputStream(f);
                    try {
                        model.read(inputStream, this.baseUri, lang);
                    } catch(e) { // invalid rdf
                    }
                } else {
                    // not rdf, figure out which file it is
                    // figure out format using extension
                    rdf.readNonRDFInto(model, f);
                }
            }
            return model;
        } else {
            var inputStream = new FileInputStream(file);

            var model = rdf.createModel(inputStream, filePath, this.baseUri);
            return model;
        }
    },
    readNonRDFInto: function(model, file) {
        var ext = FilenameUtils.getExtension(file.getName()).toLowerCase();
        var inputStream = new FileInputStream(file);

        var jsonld = { '@graph': [], '@context': {} };
        if(ext == 'obo') {
            // convert OBO to rdf
            var parser = new OBOFormatParser();
            var obodoc = parser.parse(file.getPath());
            
            // create a translator object and feed it the OBO Document
            var bridge = new Obo2Owl();
            var manager = bridge.getManager();
            var ontology = bridge.convert(obodoc);

            var format = new RDFXMLOntologyFormat();
            var tempFile = 'temp.rdf';
            var filePath = rdfPath + tempFile;

            // save rdf file
            var out = new FileOutputStream(filePath);
            manager.saveOntology(ontology, format, out);

            // read it into a model in memory
            var rdfXmlModel = rdf.createModelFrom(tempFile);
            var queryString = 'CONSTRUCT { ?s ?p ?o }\
                               WHERE {\
                                ?s ?p ?o .\
                               }';

            var query = QueryFactory.create(queryString);
            // Execute the query and obtain results
            var qe = QueryExecutionFactory.create(query, rdfXmlModel);

            // Execute a CONSTRUCT query, putting the statements into 'rdfXmlModel'.
            qe.execConstruct(rdfXmlModel);

            // add these statements to the overall model
            model.add(rdfXmlModel);

        } else if(ext == 'csv' || ext == 'xls' || ext == 'xlsx'){
            // convert template to rdf

            // add regular prefixes such as skos:Concept
            var context = {};
            for(var p in rdf.prefixes) {
                context[p] = rdf.prefixes[p]; 
            }

            jsonld['@context'] = context;

            excel.parseTemplate(inputStream, function(row) {
                // update @context
                

                // these are json-ld objects
                var person = excel.getPerson(row);
                var institution = excel.getInstitution(row, person);

                var traitClass = excel.getTraitClass(row);
                var trait = excel.getTrait(row, person, traitClass);

                var method = excel.getMethod(row, trait);
                var scale = excel.getScale(row, method);

                if(scale['@type'].indexOf('cov:Categorical') > -1) {
                    // this will return multiple json-ld objects
                    var categories = excel.getCategories(row, scale);
                    for(var i=0; i<categories.length; i++) {
                        jsonld['@graph'].push(categories[i]);
                    }
                }

                // add language in context
                //jsonld['@context']['@language'] = trait['Language of submission (only in ISO 2 letter codes)'.toLowerCase()].toLowerCase();


                jsonld['@graph'].push(person);
                jsonld['@graph'].push(institution);

                jsonld['@graph'].push(traitClass);
                jsonld['@graph'].push(trait);

                jsonld['@graph'].push(method);
                jsonld['@graph'].push(scale);

            });

            var jsonldStringified = new java.lang.String(JSON.stringify(jsonld));
            var jsonStream = new ByteArrayInputStream(jsonldStringified.getBytes("UTF-8"));
            model.read(jsonStream, this.baseUri, 'JSON-LD');
        }
    },
    queryModel: function(queryString, model) {
        // add prefixes to sparql query
        queryString = rdf.buildSparqlPrefixes() + queryString;
        var query = QueryFactory.create(queryString);

        // Execute the query and obtain results
        var qe = QueryExecutionFactory.create(query, model);
        var results = qe.execSelect();

        var arr = [];
        while(results.hasNext()) {
            var querySolution = results.next();
            var obj = {};

            var iter = querySolution.varNames();
            while(iter.hasNext()) {
                var varName = iter.next();
                var rdfNode = querySolution.get(varName);
                obj[varName] = rdfNode;
            }

            arr.push(obj);
        }

        qe.close();
        return arr;
    },
    query: function(filePath, queryString) {
        // create file if it doesn't exist
        rdf.createPath(filePath);

        var model = rdf.createModelFrom(filePath);
        var results = rdf.queryModel(queryString, model);

        return results;
    },
    updateModel: function(updateString, model) {
        var updateRequest = UpdateFactory.create(updateString);

        UpdateAction.execute(updateRequest, model);
    },
    update: function(filePath, updateString) {
        // create file if it doesn't exist
        rdf.createPath(filePath);

        var model = rdf.createModelFrom(filePath);
        updateString = rdf.buildSparqlPrefixes() + updateString;

        rdf.updateModel(updateString, model);

        // persist to disk
        var fileOut = new FileOutputStream(rdfPath + filePath);
        model.write(fileOut, 'TURTLE', this.baseUri);
        model.close();
    },
    convertToSlug: function(Text)
    {
        return Text
            .replace(/^\s+|\s+$/g, '') // trim
            .toLowerCase()
            .replace(/[^a-z0-9 -]/g, '') // remove invalid chars
            .replace(/\s+/g, '-') // collapse whitespace and replace by -
            .replace(/-+/g, '-') // collapse dashes
            ;
    }
    /*
    parse: function(inputStream, fileName, baseUri, cb) {
        var lang = RDFLanguages.filenameToLang(fileName);
        //var output = new SinkTripleOutput(System.out, null, SyntaxLabels.createNodeToLabel());
        var o = {
            //triple: function(triple) {
            //    output.send(triple);
            //}
            triple: cb
        }
        var rdfBase = new JavaAdapter(StreamRDFBase, o);

        RDFDataMgr.parse(rdfBase, inputStream, baseUri, lang);

    }
    */
};
