/**
 * Java platform compiler
 */
var fs = require('fs'),
	path = require('path'),
	exec = require('child_process').exec,
	Uglify = require('uglify-js'),
	_ = require('underscore'),
	hyperloop = require('hyperloop-common'),
	log = hyperloop.log,
	util = hyperloop.util,
	jsgen = hyperloop.compiler.jsgen,
	typelib = hyperloop.compiler.type,
	buildlib = require('./buildlib'),
	library = require('./library');

exports.initialize = initialize;
exports.finish = finish;
exports.beforeCompile = beforeCompile;
exports.afterCompile = afterCompile;
exports.isValidSymbol = isValidSymbol;
exports.validateSymbols = validateSymbols;
exports.getFileExtension = library.getFileExtension;
exports.getFunctionSymbol = getFunctionSymbol;
exports.getInstanceMethodSymbol = getInstanceMethodSymbol;
exports.getStaticMethodSymbol = getStaticMethodSymbol;
exports.getSetterSymbol = getSetterSymbol;
exports.getGetterSymbol = getGetterSymbol;
exports.defineClass = defineClass;
exports.defineMethod = defineMethod;
exports.findProperty = findProperty;

function initialize(options, build_options, arch, sdks, settings, callback) {
	library.loadMetabase(options, arch, sdks, settings, function(err, ast, libfile, astFile){
		return callback(err, {metabase:ast, libfile:libfile});
	});
}

function finish(options, build_opts, arch, state, uncompiledFiles, compiledFiles, callback) {

	if (state.custom_classes) {

		var java_files = [];
		var java_classes = Object.keys(state.custom_classes).forEach(function(c) {
			var fn = c.replace(/\./g,'/')+'.java';
			java_files.push(fn);
			// generate Java source
			library.generateCustomJavaClass(options, state, state.metabase, c);
		});


		buildlib.getJavaHome(function(err,javahome){
			var javac = path.join(javahome,'bin','javac'),
				outdir = path.resolve(options.dest),
				cmd = javac+' -g -d "'+outdir+'" '+java_files.join(' '),
				cwd = process.cwd();
				process.chdir(path.join(options.srcdir, 'java'));
				log.debug(cmd);
				exec(cmd, function(err,stdout,stderr){
					if (err) {
						log.fatal(stderr);
					}

					process.chdir(cwd);

					callback();
				});
		});
	} 
	else {
		callback();
	}
}

function beforeCompile(state, arch, filename, jsfilename, relativeFilename, source) {
	state.symbols = {};
}

function afterCompile(state, arch, filename, jsfilename, relativeFilename, source, sourceAST) {
}

function isValidSymbol(state, name) {
	if (!name) throw new Error("name required");
	var sym = state.metabase.classes[name];
	return !!sym;
}

function findMethod(metabase, cls, method, args, isInstance, node, nodefail) {
	var entry = metabase.classes[cls],
		methods = _.clone(entry.methods),
		argcount = args.length;

	// search for super classes
	if (!methods[method]) {
		entry = metabase.classes[entry.superClass];
		while(entry) {
			entry.methods && Object.keys(entry.methods).forEach(function(name){
				if (!(name in methods)) {
					methods[name] = entry.methods[name];
				}
			});
			entry = metabase.classes[entry.superClass];
		}
	}

	// match up arg count
	var result = _.filter(methods[method], function(m){
		return m.args.length == argcount && isInstance == m.instance;
	});

	if (!result || result.length == 0) {
		return undefined;
	}

	if (result && result.length == 1) {
		return result[0];
	} else {
		var msg = "can't disambiguate arguments for method "+method.yellow,
			help = '  The following method signatures are available:\n\n'.yellow,
			guide = '';
		result.forEach(function(m) {
			guide += '\tHyperloop.method('+util.sanitizeSymbolName(cls).toLowerCase()+', ';
			guide += '\''+method+'(';
			var argt = [];
			m.args.forEach(function(arg) {
				argt.push(arg.type);
			});
			guide += argt.join(',');
			guide += ')\')\n';
		});
		help += guide.red.bold;
		nodefail(node, msg, help);
	}
	return result;
}

function getFunctionSymbol(state, name, symbolname, node, nodefail) {
	//TODO
}

function getInstanceMethodSymbol(state, cls, method, varname, symbolname, node, nodefail) {
	var m = findMethod(state.metabase, cls, method, node.args, true, node, nodefail);
	if (!m) {
		nodefail(node, "couldn't find instance method: "+method.yellow+" for class: "+cls.yellow+" with argcount "+node.args.length.toString().yellow);
	}
	return {type:'method',metatype:'instance',symbolname:symbolname,instance:varname,class:cls,name:method,location:node.start,argcount:node.args.length,method:m,returnType:m.returnType};
}

function getStaticMethodSymbol(state, cls, method, symbolname, node, nodefail) {
	var m = findMethod(state.metabase, cls, method, node.args, false, node, nodefail);
	if (!m) {
		nodefail(node, "couldn't find static method: "+method.yellow+" for class: "+cls.yellow+" with argcount "+node.args.length.toString().yellow);
	}
	return {type:'method',metatype:'static',symbolname:symbolname,instance:null,class:cls,name:method,location:node.start,argcount:node.args.length,method:m,returnType:m.returnType};
}

function getSetterSymbol(state, cls, name, instanceName, symbolname, node, nodefail) {
	var property = findProperty(state.metabase, cls, name);
	return {type:'statement',metatype:'setter',symbolname:symbolname,class:cls,name:name,instance:instanceName,location:node.start,property:property,argcount:(instanceName ? 1 : 0)};
}

function getGetterSymbol(state, cls, name, instanceName, symbolname, node, nodefail) {
	var property = findProperty(state.metabase, cls, name);
	return {type:'statement',metatype:'getter',symbolname:symbolname,class:cls,name:name,instance:instanceName,location:node.start,property:property,returnType:property.type};
}

function findProperty (metabase, classname, property) {
	var cls = metabase.classes[classname];
	if (cls) {
		var p = cls.properties[property];
		if (p) {
			return p;
		}
		var superClass = cls.superClass;
		if (superClass) {
			return findProperty(metabase, superClass, property);
		}
	}
}

function validateSymbols(state, arch, symbols, nodefail) {
	var metabase = state.metabase;
	Object.keys(symbols).forEach(function(key){
		var entry = symbols[key];
		switch (entry.type) {
			case 'function': {
				//TODO
				break;
			}
			case 'constructor': {
				//TODO
				break;
			}
			case 'statement': {
				//TODO
				break;
			}
			case 'method': {
				var method = entry.method;
				if (method && method.args && method.args.length!==entry.argcount) {
					nodefail(entry.location, "wrong number of arguments passed to "+entry.name.yellow);
				}
				break;
			}
		}
	});
}

function registerCustomEnumForMetabase(options, state, metabase, parentclass, dict, item) {
	if (metabase.classes[item.type]) {
		log.warn(item.type+' is already defined in metabase. Skip.');
		return;
	}
	var c = metabase.classes[item.type] = {};
	c.package = metabase.classes[parentclass].package;
	c.interfaces = [];
	c.superClass = 'java.lang.Enum';
	c.metatype = 'class';
	c.attributes = _.clone(item.attributes);
	c.methods = {};
	c.properties = {};
	item.value.forEach(function(value) {
		c.properties[value] = {
			name:value,
			metatype: 'field',
			attributes: ['final','public','static'],
			type: item.type
		};
	});
}

function registerCustomClassForMetabase(options, state, metabase, classname, dict) {
	if (metabase.classes[classname]) {
		log.warn(classname+' is already defined in metabase. Skip.');
		return;
	}

	function valueMapper(a) {
		return a.value;
	}
	var c = metabase.classes[classname] = {};
	c.package = dict.package && dict.package[0].value || options.appid || '';
	c.superClass = dict.extends && dict.extends[0].value || 'java.lang.Object';
	c.attributes = dict.attributes ? _.clone(dict.attributes).map(valueMapper) : ['public'];
	c.metatype = c.attributes.indexOf('interface') < 0 ? 'class' : 'interface';
	c.interfaces = dict.implements ? dict.implements.map(valueMapper) : [];
	c.annotations = dict.annotations ? _.clone(dict.annotations).map(valueMapper) : [];
	c.methods = {};
	c.properties = {};


	// constructor
	if (dict.init) {
		// TODO setup constructor args and signature
	} else {
		dict.method.push({type:'value',name:'<init>', signature:'()V'}); // default constructor
	}

	// methods
	dict.method && dict.method.forEach(function(m) {
		m = m.value ? m.value : m;

		var name = m.name && m.name.value || m.name;
		var entries = c.methods[name] || [];
		var entry = {};

		entry.exceptions = [];
		entry.args = m.arguments ? _.clone(m.arguments.value).map(valueMapper) : [];
		entry.attributes = m.attributes ? _.clone(m.attributes.value).map(valueMapper) : [];
		entry.annotations = m.annotations ? _.clone(m.annotations.value).map(valueMapper) : [];
		entry.instance = m.attributes ? m.attributes.value.indexOf('static') < 0 : true;
		entry.returnType = m.returns && m.returns.value || 'void';
		entry.hasAction = !!m.action;
		entry.action = m.action && m.action.value;
		entry.name = name;

		entry.args = entry.args.map(function(arg){
			return {
				type: arg.type.value
			};
		});

		m.signature = m.signature && m.signature.value || library.getJavaMethodSignature(options,metabase,entry);
		entry.signature = m.signature;

		entries.push(entry);
		c.methods[name] = entries;
	});

	// properties
	dict.property && dict.property.forEach(function(item) {
		var entry = {};

		entry.name = item.name;
		entry.value = item.value;
		entry.attributes = item.attributes ? _.clone(item.attributes).map(valueMapper) : [];
		entry.annotations = item.annotations ? _.clone(item.annotations).map(valueMapper) : [];
		if (item.type == 'enum') {
			entry.type = classname+'$'+item.name;
			entry.metatype = 'enum';
			registerCustomEnumForMetabase(options,state,metabase,classname,dict,entry);
		} else {
			if (dict.property.indexOf(item.type)) {
				// inner class
				entry.type = classname+'$'+item.type;
				entry.innertype = item.type;
			} else {
				entry.type = item.type;
			}
			entry.metatype = item.attributes.value.indexOf('final') < 0 ? 'field' : 'constant';
		}

		c.properties[item.name] = entry;
	});

	state.custom_classes = state.custom_classes || {};
	state.custom_classes[classname] = c;
}

/**
 * called to define a class
 */
function defineClass(options,state,arch,node,dict,fail) {
	var packagename = dict.package && dict.package[0] ? dict.package[0].value : options.appid || '',
		classname = packagename+'.'+dict.defineClass[0].value;

	// register class info onto metabase
	registerCustomClassForMetabase(options, state, state.metabase, classname, dict);

	// process 'action'
	var elements = [];
	var methods = state.custom_classes[classname].methods;
	
	Object.keys(methods).forEach(function(name) {
		if (name==='<init>') return;
		methods[name].forEach(function(method, i) {
			if (!method.hasAction) return;
			var func = util.sanitizeSymbolName(classname)+'_Action_'+name+'_'+i,
				action = (method.action.metatype==='function') ? method.action.body : method.action;
			elements.push({action: action, function: func});
		});
	});

	return {
		name: classname,
		args: elements
	};
}

/**
 * called to define a overloaded method
 */
function defineMethod(options,state,arch,node,dict,fail) {
	var varname = dict.method[0].value,
		callstr = dict.method[1].value,
		start = node.start.pos,
		distance = -Number.MAX_VALUE,
		vardef;

	// look up the type for the definition
	Object.keys(state.node_map).forEach(function(key) {
		var def = JSON.parse(key);
		// check the distance from the definition, pick up negative nearest one
		if (def.type === 'name' && def.value === varname) {
			var d = def.endpos - start;
			if (d > distance) {
				distance = d;
				vardef = state.node_map[key];
			}
		}
	});

	if (!vardef || !vardef['returnType'] && !vardef['class']) {
		log.info(vardef,varname,dict);
		log.fatal('failed to lookup the definition of',varname);
	}

	var classname = vardef['returnType'] || vardef['class'],
		match = callstr.match(/(.+)(\()(.+)(\))/);

	if (!match) {
		log.fatal(callstr+' of '+classname+' is not a valid method call');
	}

	var method     = match[1],
		methodargs = match[3].split(','),
		// look up matching method
		methods = state.metabase.classes[classname].methods[method];

	if (!methods) {
		log.fatal("couldn't find method:",method.yellow,"for class:",classname.yellow);
	}

	var signature, index;
	for (var i = 0; i < methods.length; i++) {
		var m = methods[i];
		for (var j = 0; j < m.args.length; j++) {
			if (m.args[j].type != methodargs[j]) break;
		}
		// if all matched, this is the one
		if (j == m.args.length) {
			signature = library.mangleJavaSignature(m.signature);
			index = i;
		}
	}

	if (!signature) {
		log.fatal("couldn't find method: "+method.yellow+" for class: "+classname.yellow);
	}

	var methodname = method,
		fn = jsgen.generateMethodName(classname, methodname)+signature,
		methodObj = state.metabase.classes[classname].methods[methodname][index];

	if (!methodObj) {
		log.fatal("couldn't find method: "+methodname.yellow+" for class: "+classname.yellow);
	}

	var key = state.obfuscate ? jsgen.obfuscate(fn) : fn;

	state.symbols[key] = {type:'method',metatype:'instance',symbolname:fn,instance:varname,returnType:methodObj.returnType,
					class:classname,name:methodname+signature,location:node.start,argcount:methodargs.length,
					method:_.clone(methodObj)};

	// we need to place the instance name as the first parameter in the argument list
	dict.call.unshift({type:'variable',value:varname});

	// return the name and args to use
	return {
		args: dict.call,
		name: key
	};
}