importPackage(java.util.logging);
var log = function(msg) {
    var logger = Logger.getLogger("");

    logger.info("LOG: "+msg);
};
