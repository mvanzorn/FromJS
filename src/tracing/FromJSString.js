import Origin from "../origin"
import ValueMap from "../value-map"
import unstringTracifyArguments from "./unstringTracifyArguments"

export default function StringTraceString(options){
    this.origin = options.origin
    this.value = options.value
    this.isStringTraceString = true
}

function isArray(val){
    return val.length !== undefined && val.map !== undefined;
}


// getOwnPropertyNames instead of for loop b/c props aren't enumerable
Object.getOwnPropertyNames(String.prototype).forEach(function(propertyName){
    if (propertyName === "toString") { return }
    // can't use .apply on valueOf function (" String.prototype.valueOf is not generic")
    if (propertyName === "valueOf") { return }
    if (typeof String.prototype[propertyName] === "function") {
        StringTraceString.prototype[propertyName] = function(){
            var oldValue = this;
            var args = unstringTracifyArguments(arguments)
            var newVal;


            var argumentOrigins = Array.prototype.slice.call(arguments).map(function(arg){
                return new Origin({
                    action: "arg_" + arg.toString(),
                    value: arg.toString(),
                    inputValues: []
                })
            })
            var inputValues = [oldValue.origin].concat(argumentOrigins)

            var valueItems = null;
            if (propertyName === "replace") {
                var oldString = oldValue.toString()

                var valueMap = new ValueMap();
                var inputMappedSoFar = ""

                var newVal = oldString.replace(args[0], function(){
                    var argumentsArray = Array.prototype.slice.apply(arguments, [])
                    var match = argumentsArray[0];
                    var submatches = argumentsArray.slice(1, argumentsArray.length - 2)
                    var offset = argumentsArray[argumentsArray.length - 2]
                    var string = argumentsArray[argumentsArray.length - 1]

                    var newArgsArray = [
                        match,
                        ...submatches,
                        offset,
                        string
                    ];
                    // debugger;

                    var inputBeforeToKeep = oldString.substring(inputMappedSoFar.length, offset)
                    valueMap.appendString(inputBeforeToKeep , oldValue.origin, inputMappedSoFar.length)
                    inputMappedSoFar += inputBeforeToKeep

                    var replaceWith = null;
                    if (typeof args[1] === "string") { // confusing... args[1] is basically inputValues[2].value
                        replaceWith = inputValues[2]
                    } else {
                        replaceWith = args[1].apply(this, newArgsArray)
                        if (!replaceWith.origin) {
                            replaceWith = makeTraceObject({
                                value: replaceWith,
                                origin: {
                                    value: replaceWith,
                                    action: "Untracked replace match result",
                                    inputValues: []
                                }
                            }).origin
                        } else {
                            replaceWith = replaceWith.origin
                        }
                    }
                    valueMap.appendString(replaceWith.value, replaceWith, 0)


                    inputMappedSoFar += match

                    return replaceWith.value
                })

                valueMap.appendString(oldString.substring(inputMappedSoFar.length), oldValue.origin, inputMappedSoFar.length)

                valueItems = valueMap.serialize(inputValues)

            } else if (propertyName === "slice"){
                var valueMap = new ValueMap();
                if (args[1] < 0) {throw "not handled yet"}

                var oldString = oldValue.toString()
                newVal = oldString.slice(args[0], args[1])

                valueMap.appendString(newVal, oldValue.origin, args[0]) // oldvalue.origin is inputValues[0]

                valueItems = valueMap.serialize(inputValues)

            } else {
                newVal = String.prototype[propertyName].apply(this.toString(), args);
            }

            if (typeof newVal === "string") {
                return makeTraceObject(
                    {
                        value: newVal,
                        origin: new Origin({
                            value: newVal,
                            valueItems: valueItems,
                            inputValues: inputValues,
                            action: propertyName + " call",
                        })
                    }
                )
            } else if (isArray(newVal)) {
                return newVal.map(function(val){
                    if (typeof val === "string"){
                        return makeTraceObject(
                            {
                                value: val,
                                origin: new Origin({
                                    value: val,
                                    inputValues: inputValues,
                                    action: propertyName + " call",
                                })
                            }
                        )
                    } else {
                        return val
                    }
                })
            } else {
                return newVal
            }
        }
    }
})
StringTraceString.prototype.valueOf = function(){
    return this.value;
}
StringTraceString.prototype.toString = function(){
    return this.value
}
StringTraceString.prototype.toJSON = function(){
    return this.value
}

export function makeTraceObject(options){
    var stringTraceObject = new StringTraceString({
        value: options.value,
        origin: options.origin
    })
    return new Proxy(stringTraceObject, {
        ownKeys: function(){
            return []
        }
    });
}
