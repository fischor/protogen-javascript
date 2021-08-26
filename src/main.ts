import * as descriptor_pb from "google-protobuf/google/protobuf/descriptor_pb";
// "jspb" is a conventional import name.
import * as jspb from "google-protobuf";

import {
  Registry,
  resolveEnumTypeName,
  resolveMessageTypeName,
} from "./registry";
import { findLocation } from "./sourceCodeInfo";
import { camelCase, normaliseFieldObjectName } from "./util";

/**
 * A proto file.
 *
 * This is the ``protogen`` equivalent to a protobuf FileDescriptor. The files
 * attributes are obtained from the FileDescriptor it is derived from and
 * references to other ``protogen`` classes that have been resolved in the
 * resolution process. It represents a Protobuf file (`.proto` file).
 */
export class File {
  /* The raw FileDescriptor of the file . */
  readonly proto: descriptor_pb.FileDescriptorProto;

  /* Name of the proto file. */
  readonly name: string;

  /* Name of the proto package the file belongs to. */
  readonly packageName: string;

  /* Proto syntax of the file */
  readonly syntax: string;

  /* JavaScript import path of the file. */
  readonly jsImportPath: JSImportPath;

  /* Whether code should be generated for the file. */
  readonly generate: boolean;

  /* Files imported by the file. */
  readonly dependencies: File[] = [];

  /* Top-level enum declarations. */
  readonly enums: Enum[] = [];

  /* Top-level message declarations. */
  readonly messages: Message[] = [];

  /* Service declarations. */
  readonly services: Service[] = [];

  /* Top-level extension declarations. */
  readonly extensions: Extension[] = [];

  /* Options specified on the file. */
  readonly options: FileOptions;

  constructor(
    proto: descriptor_pb.FileDescriptorProto,
    generate: boolean,
    jsImportFunc: (filename: string, protoPackage: string) => JSImportPath
  ) {
    this.proto = proto;
    this.options = new FileOptions(proto.getOptions() ?? null);

    let name = proto.getName();
    if (!name) throw new Error("Name is null in file");
    this.name = name;

    let syntax = proto.getSyntax();
    // if (!syntax) throw new Error(`Syntax is null in file ${this.name}`);
    this.syntax = syntax || ""; // TODO: this throws an error for descriptor.proto

    let packageName = proto.getPackage();
    if (!packageName)
      throw new Error(`Package is not populated in file ${name}.`);
    this.packageName = packageName;

    this.generate = generate;
    this.jsImportPath = jsImportFunc(name, packageName);

    // Register messages and submessages to the registry.
    let messageTypeProtos = proto.getMessageTypeList();
    for (let i = 0; i < messageTypeProtos.length; i++) {
      let path = [4, i]; // 4 is the number of the message_type list in the FileDescriptorProto message.
      let message = new Message(messageTypeProtos[i], this, null, path);
      this.messages.push(message);
    }

    // Create top level enums.
    let enumTypeProtos = proto.getEnumTypeList();
    for (let i = 0; i < enumTypeProtos.length; i++) {
      let path = [5, i]; // 5 is the number of the enum_type list in the FileDescriptorProto message.
      let enumType = new Enum(enumTypeProtos[i], this, null, path);
      this.enums.push(enumType);
    }

    // Create services.
    let serviceProtos = proto.getServiceList();
    for (let i = 0; i < serviceProtos.length; i++) {
      let path = [6, i]; // 6 is the number of the service list in the FileDescriptorProto message.
      let service = new Service(serviceProtos[i], this, path);
      this.services.push(service);
    }

    // Create top-level extensions.
    let extensionProtos = proto.getExtensionList();
    for (let i = 0; i < extensionProtos.length; i++) {
      let path = [7, i]; // 7 is the number of the extension list in the FileDescriptorProto message.
      let extension = new Field(extensionProtos[i], null, this, null, path);
      this.extensions.push(extension);
    }
  }

  _register(reg: Registry) {
    reg.registerFile(this);

    for (let m of this.messages) {
      m._register(reg);
    }
    for (let e of this.enums) {
      reg.registerEnum(e);
    }
    for (let s of this.services) {
      s._register(reg);
    }
    for (let e of this.extensions) {
      reg.registerExtension(e);
    }
  }

  _resolve(reg: Registry) {
    for (let depName of this.proto.getDependencyList()) {
      let file = reg.fileByName(depName);
      if (file == null) {
        throw new Error(
          `file ${this.name}: failed to resolve dependency ${depName}`
        );
      }
      this.dependencies.push(file);
    }
    for (let m of this.messages) {
      m._resolve(reg);
    }
    for (let s of this.services) {
      s._resolve(reg);
    }
    for (let e of this.extensions) {
      e._resolve(reg);
    }
  }
}

/**
 * Proto file options.
 *
 * This is the ``protogen`` equivalent to the protobuf FileOptions type. The
 * attributes are obtained from the protobuf FileOptions and exposed in this
 * type for easier access.
 */
export class FileOptions {
  /* The raw protobuf MessageOptions. */
  proto: descriptor_pb.FileOptions | null;

  /* Value of the `java_package` option if specified. */
  javaPackage: string | undefined;

  /* Value of the `java_outer_classname` option if specified. */
  javaOuterClassname: string | undefined;

  /* Value of the `java_multiple_files` option. Defaults to `false`. */
  javaMultipleFiles: boolean;

  /* Value of the `java_string_check_utf8` option. Defaults to `false`. */
  javaStringCheckUtf8: boolean;

  /* Value of the `optimize_for` option. Defaults to `OptimizeMode.SPEED`. */
  optimizeFor: descriptor_pb.FileOptions.OptimizeMode;

  /* Value of the `go_package` option if specified. */
  goPackage: string | undefined;

  /* Value of the `cc_generic_services` option. Defaults to `false`. */
  ccGenericServices: boolean;

  /* Value of the `java_generic_services` option. Defaults to `false`. */
  javaGenericServices: boolean;

  /* Value of the `py_generic_services` option. Defaults to `false`. */
  pyGenericServices: boolean;

  /* Value of the `php_generic_services` option. Defaults to `false`. */
  phpGenericServices: boolean;

  /* If `true` the file is deprecated. Defaults to `false`. */
  deprecated: boolean;

  /* Value of the `cc_enable_areas` option. Defaults to `true`. */
  ccEnableArenas: boolean;

  /* Value of the `objc_class_prefix` option if specified. */
  objcClassPrefix: string | undefined;

  /* Value of the `csharp_namespace` option if specified. */
  csharpNamespace: string | undefined;

  /* Value of the `swift_prefix` option if specified. */
  swiftPrefix: string | undefined;

  /* Value of the `php_class_prefix` option if specified. */
  phpClassPrefix: string | undefined;

  /* Value of the `php_namespace` option if specified. */
  phpNamespace: string | undefined;

  /* Value of the `php_metadata_namespace` option if specified. */
  phpMetadataNamespace: string | undefined;

  /* Value of the `ruby_package` option if specified. */
  rubyPackage: string | undefined;

  constructor(proto: descriptor_pb.FileOptions | null) {
    this.proto = proto;
    this.javaPackage = proto?.getGoPackage();
    this.javaOuterClassname = proto?.getJavaOuterClassname();
    this.javaMultipleFiles = proto?.getJavaMultipleFiles() ?? false;
    this.javaStringCheckUtf8 = proto?.getJavaStringCheckUtf8() ?? false;
    this.optimizeFor =
      proto?.getOptimizeFor() ?? descriptor_pb.FileOptions.OptimizeMode.SPEED;
    this.goPackage = proto?.getGoPackage();
    this.ccGenericServices = proto?.getCcGenericServices() ?? false;
    this.javaGenericServices = proto?.getJavaGenericServices() ?? false;
    this.pyGenericServices = proto?.getPyGenericServices() ?? false;
    this.phpGenericServices = proto?.getCcGenericServices() ?? false;
    this.deprecated = proto?.getDeprecated() ?? false;
    this.ccEnableArenas = proto?.getCcEnableArenas() ?? true;
    this.objcClassPrefix = proto?.getObjcClassPrefix();
    this.csharpNamespace = proto?.getCsharpNamespace();
    this.swiftPrefix = proto?.getSwiftPrefix();
    this.phpClassPrefix = proto?.getPhpClassPrefix();
    this.phpNamespace = proto?.getPhpNamespace();
    this.phpMetadataNamespace = proto?.getPhpMetadataNamespace();
    this.rubyPackage = proto?.getRubyPackage();
  }

  /**
   * Get a file extension.
   *
   * @param handle The extension handle.
   * @returns The extension value if present on the file. `null` otherwise.
   */
  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * A proto service.
 *
 * This is the ``protogen`` equivalent to a protobuf ServiceDescriptor. The
 * services attributes are obtained from the ServiceDescriptor it is derived
 * from and references to other ``protogen`` classes that have been resolved in
 * the resolution process. It represents a Protobuf service defined within an
 * `.proto` file.
 */
export class Service {
  readonly proto: descriptor_pb.ServiceDescriptorProto;
  readonly name: string;
  readonly fullName: string;
  readonly jsIdent: JSIdent;
  readonly parentFile: File;
  readonly methods: Method[] = [];
  readonly options: ServiceOptions;
  readonly location: Location;

  constructor(
    proto: descriptor_pb.ServiceDescriptorProto,
    parentFile: File,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new ServiceOptions(proto.getOptions() ?? null);
    this.parentFile = parentFile;
    this.location = findLocation(parentFile.proto, path);

    let name = proto.getName();
    if (!name) throw new Error("Service name not populated");
    this.name = name;
    this.fullName = `${this.parentFile.packageName}.${name}`;
    this.jsIdent = parentFile.jsImportPath.ident(name);

    // Create service methods.
    let methodProtos = proto.getMethodList();
    for (let i = 0; i < methodProtos.length; i++) {
      let method = new Method(methodProtos[i], this, [...path, 2, i]);
      this.methods.push(method);
    }
  }

  _register(reg: Registry) {
    reg.registerService(this);
  }

  _resolve(reg: Registry) {
    for (let m of this.methods) {
      m._resolve(reg);
    }
  }
}

/**
 * Proto service options.
 *
 * This is the ``protogen`` equivalent to the protobuf ServiceOptions type. The
 * attributes are obtained from the protobuf ServiceOptions and exposed in this
 * type for easier access.
 */
export class ServiceOptions {
  /* The raw protobuf ServiceOptions. */
  proto: descriptor_pb.ServiceOptions | null;

  /* If `true` the service is deprecated. Defaults to `false`. */
  deprecated: boolean;

  constructor(proto: descriptor_pb.ServiceOptions | null) {
    this.proto = proto;
    this.deprecated = proto?.getDeprecated() ?? false;
  }

  /**
   * Get a service extension.
   *
   * @param handle The extension handle.
   * @returns The extension value if present on the service. `null` otherwise.
   */
  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * A proto method.
 *
 * This is the ``protogen`` equivalent to a protobuf MethodDescriptor. The
 * methods attributes are obtained from the MethodDescriptor it is derived from
 * and references to other ``protogen`` classes that have been resolved in the
 * resolution process. It represents a Protobuf method declared within a
 * Protobuf service definition.
 */
export class Method {
  /* The raw MethodDescriptor of the method . */
  readonly proto: descriptor_pb.MethodDescriptorProto;

  /* Proto name of the method. */
  readonly name: string;

  /* Full proto name of the method. */
  readonly fullName: string;

  /* Javascript name of the method. A camel cased version of the proto name. */
  readonly jsName: string;

  /* If `true`, the method is a client streaming method. */
  readonly clientStreaming: boolean;

  /* If `true`, the method is a server streaming method. */
  readonly serverStreaming: boolean;

  /**
   * The grpc path of the method. Derived from the service and method name:
   * "/" + <service_full_name> + "/" + <method_short_name>
   */
  readonly grpcPath: string;

  /* The service the method is declared in. */
  readonly parent: Service;

  /* The input message of the method. */
  readonly input!: Message; // set after resolve

  /* The output message of the method. */
  readonly output!: Message; // set after resolve

  /* Options specified on the method. */
  readonly options: MethodOptions;

  /* Comments associated with the message. */
  readonly location: Location;

  constructor(
    proto: descriptor_pb.MethodDescriptorProto,
    parent: Service,
    path: number[]
  ) {
    this.proto = proto;
    let name = proto.getName();
    if (!name) throw new Error("Initializing method with no name."); // TODO(fischor): better error message
    this.name = name;
    this.jsName = this.name.charAt(0).toLowerCase() + this.name.slice(1);
    this.fullName = `${parent.fullName}.${name}`;
    this.clientStreaming = proto.getClientStreaming() ?? false;
    this.serverStreaming = proto.getServerStreaming() ?? false;
    this.grpcPath = `/${parent.fullName}/{name}`;
    this.parent = parent;
    this.location = findLocation(parent.parentFile.proto, path);
    this.options = new MethodOptions(proto.getOptions() ?? null);
  }

  /**
   * Resolve reads the input and output messages for the Method from reg.
   */
  _resolve(reg: Registry) {
    let inputName = this.proto.getInputType() || "";
    let input = resolveMessageTypeName(reg, this.fullName, inputName);
    if (!input)
      throw new Error(`Method ${this.fullName}: ${inputName} not registered`);
    // @ts-ignore
    this.input = input;

    let outputName = this.proto.getOutputType() || "";
    let output = resolveMessageTypeName(reg, this.fullName, outputName);
    if (!output)
      throw new Error(`Method ${this.fullName}: ${inputName} not registered`);
    // @ts-ignore
    this.output = output;
  }
}

/**
 * Proto method options.
 *
 * This is the ``protogen`` equivalent to the protobuf MethodOptions type. The
 * attributes are obtained from the protobuf MethodOptions and exposed in this
 * type for easier access.
 */
export class MethodOptions {
  /* The raw protobuf MethodOptions. */
  proto: descriptor_pb.MethodOptions | null;

  /* If `true` the method is deprecated. Defaults to `false`. */
  deprecated: boolean;

  /* Idempotency level of the method. Defaults to IDEMPOTENCY_UNKNOWN. */
  idempotencyLevel: descriptor_pb.MethodOptions.IdempotencyLevel;

  constructor(proto: descriptor_pb.MethodOptions | null) {
    this.proto = proto;
    this.deprecated = proto?.getDeprecated() ?? false;
    this.idempotencyLevel =
      proto?.getIdempotencyLevel() ??
      descriptor_pb.MethodOptions.IdempotencyLevel.IDEMPOTENCY_UNKNOWN;
  }

  /**
   * Get a method extension.
   *
   * @param handle The extension handle.
   * @returns The extension value if present on the method. `null` otherwise.
   */
  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * A proto message.
 *
 * This is the ``protogen`` equivalent to a protobuf Descriptor. The messages
 * attributes are obtained from the Descriptor it is derived from and references
 * to other ``protogen`` classes that have been resolved in the resolution
 * process. It represents a Protobuf message defined within an `.proto` file.
 */
export class Message {
  /* The raw Descriptor of the message . */
  readonly proto: descriptor_pb.DescriptorProto;

  /* Proto name of the message. */
  readonly name: string;

  /* Full proto name of the message. */
  readonly fullName: string;

  /* JavaScript identifier of the message. */
  readonly jsIdent: JSIdent;

  /* The file the message is defined in. */
  readonly parentFile: File;

  /**
   * The parent message in case this is a nested message. `null` for top-level
   * messages.
   */
  readonly parent: Message | null;

  /* Message field declarations. This includes fields defined within oneofs. */
  readonly fields: Field[] = [];

  /* Oneof declarations. */
  readonly oneofs: Oneof[] = [];

  /* Nested enum declarations. */
  readonly enums: Enum[] = [];

  /* Nested message declarations. */
  readonly messages: Message[] = [];

  /* Nested extension declations. */
  readonly extensions: Extension[] = [];

  /* Options specified on the message. */
  readonly options: MessageOptions;

  /* Comments associated with the message. */
  readonly location: Location;

  constructor(
    proto: descriptor_pb.DescriptorProto,
    parentFile: File,
    parent: Message | null,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new MessageOptions(proto.getOptions() ?? null);

    let name = proto.getName();
    if (!name) throw new Error("Initializing message with no name."); // TODO(fischor): better error message
    this.name = name;

    this.fullName = parent
      ? `${parent.fullName}.${name}`
      : `${parentFile.packageName}.${name}`;
    this.parent = parent;
    this.parentFile = parentFile;

    this.location = findLocation(parentFile.proto, path);
    let relFullName = this.fullName.slice(
      this.parentFile.packageName.length + 1
    ); // +1 for the dot
    this.jsIdent = parentFile.jsImportPath.ident(relFullName);

    // Create oneofs.
    let oneofProtos = proto.getOneofDeclList();
    for (let i = 0; i < oneofProtos.length; i++) {
      let oneOfPath = [...path, 8, i]; // 8 is the number of the oneof_decl list in DescriptorProto
      let oneof = new Oneof(oneofProtos[i], this, oneOfPath);
      this.oneofs.push(oneof);
    }

    // Create fields.
    let fieldsProto = proto.getFieldList();
    for (let i = 0; i < fieldsProto.length; i++) {
      let fieldPath = [...path, 2, i]; // 2 is the number of the field list in DescriptorProto

      // Confusion: https://github.com/protocolbuffers/protobuf/issues/170#issue-54707235
      let field: Field;
      if (fieldsProto[i].hasOneofIndex()) {
        let oneofIdx = fieldsProto[i].getOneofIndex() || 0;
        if (this.oneofs.length < oneofIdx)
          throw new Error(
            `no such oneofindex ${oneofIdx} in ${this.fullName} (got ${this.oneofs.length} oneofs)`
          );
        let oneof = this.oneofs[oneofIdx];
        field = new Field(fieldsProto[i], this, parentFile, oneof, fieldPath);
        // Push the fields to both, the Oneof and the Message itself, since in the
        // end this field will be part of the Message.fields and
        // Message.oneof[i].fields.
        oneof.fields.push(field);
        this.fields.push(field);
      } else {
        field = new Field(fieldsProto[i], this, parentFile, null, fieldPath);
        this.fields.push(field);
      }
    }

    // Create nested messages.
    let nestedTypeProtos = proto.getNestedTypeList();
    for (let i = 0; i < nestedTypeProtos.length; i++) {
      let nestedPath = [...path, 3, i]; // 3 is the field_number for `nested_type` in DescriptorProto message.
      let nestedMessage = new Message(
        nestedTypeProtos[i],
        parentFile,
        this,
        nestedPath
      );
      this.messages.push(nestedMessage);
    }

    // Create nested enums.
    let enumTypeProtos = proto.getEnumTypeList();
    for (let i = 0; i < enumTypeProtos.length; i++) {
      let nestedPath = [...path, 4, i]; // 4 is the field_number for `enum_type` in DescriptorProto message.
      let enumType = new Enum(enumTypeProtos[i], parentFile, this, nestedPath);
      this.enums.push(enumType);
    }

    // Create nested extensions.
    let extensionProtos = proto.getExtensionList();
    for (let i = 0; i < extensionProtos.length; i++) {
      let nestedPath = [...path, 6, i]; // 6 is the field_number for `extension` in DescriptorProto message.
      let extension = new Field(
        extensionProtos[i],
        this,
        parentFile,
        null,
        nestedPath
      );
      this.extensions.push(extension);
    }
  }

  _register(reg: Registry) {
    reg.registerMessage(this);
    for (let m of this.messages) {
      reg.registerMessage(m);
    }
    for (let e of this.enums) {
      reg.registerEnum(e);
    }
    for (let e of this.extensions) {
      reg.registerExtension(e);
    }
  }

  _resolve(reg: Registry) {
    for (let m of this.messages) {
      m._resolve(reg);
    }
    for (let f of this.fields) {
      f._resolve(reg);
    }
    for (let e of this.extensions) {
      e._resolve(reg);
    }

    // Remove autogenerated messages. This must happen
    // here and can not happen directly in the constructor
    // because the map needs to be registered and resolved
    // as well. Looping backwards to remove inplace.
    let i = this.messages.length;
    while (i--) {
      let m = this.messages[i];
      if (m.proto.getOptions() && m.proto.getOptions()!.getMapEntry() == true) {
        this.messages.splice(i, 1);
      }
    }
  }
}

/**
 * Proto message options.
 *
 * This is the ``protogen`` equivalent to the protobuf MessageOptions type. The
 * attributes are obtained from the protobuf MessageOptions and exposed in this
 * type for easier access.
 */
export class MessageOptions {
  /* The raw protobuf MessageOptions. */
  proto: descriptor_pb.MessageOptions | null;

  /**
   * If `true` the old proto1 Message wire format for extensions should be used.
   * Defaults to `false`.
   **/
  messageSetWireFormat: boolean;

  /**
   * If `true` disables the generation of the standard "descriptor()" accessor.
   * Default to false.
   **/
  noStandardDescriptorAccessor: boolean;

  /* If `true` the enum value is deprecated. Defaults to `false`. */
  deprecated: boolean;

  /** has no default */
  /* If `true` the message is an autogenerated map. */
  mapEntry: boolean | undefined;

  constructor(proto: descriptor_pb.MessageOptions | null) {
    this.proto = proto;
    this.messageSetWireFormat = proto?.getMessageSetWireFormat() ?? false;
    this.noStandardDescriptorAccessor =
      proto?.getNoStandardDescriptorAccessor() ?? false;
    this.deprecated = proto?.getDeprecated() ?? false;
    this.mapEntry = proto?.getMapEntry();
  }

  /**
   * Get a message extension.
   *
   * @param handle The extension handle.
   * @returns The extension value if present on the message. `null` otherwise.
   */
  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * A proto enum.
 *
 * This is the ``protogen`` equivalent to a protobuf EnumDescriptor. The enums
 * attributes are obtained from the EnumDescriptor it is derived from and
 * references to other ``protogen`` classes that have been resolved in the
 * resolution process. It represents a Protobuf enum defined within an `.proto`
 * file.
 */
export class Enum {
  /* The raw EnumDescriptor of the enum . */
  readonly proto: descriptor_pb.EnumDescriptorProto;

  /* Proto name of the enum. */
  readonly name: string;

  /* Full proto name of the enum. */
  readonly fullName: string;

  /* JavaScript identifier of the enum. */
  readonly jsIdent: JSIdent;

  /* Values of the enum. */
  readonly values: EnumValue[] = [];

  /* The file the enum is declared in. */
  readonly parentFile: File;

  /* For nested enums, the message the enum is declared in. `null` otherwise. */
  readonly parent: Message | null;

  /* Options specified on the enum. */
  readonly options: EnumOptions;

  /* Comments associated with the enum. */
  readonly location: Location;

  constructor(
    proto: descriptor_pb.EnumDescriptorProto,
    parentFile: File,
    parent: Message | null,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new EnumOptions(proto.getOptions() ?? null);
    let name = proto.getName();
    // TODO(fischor): better error message
    if (!name) throw new Error("Enum has no name");
    this.name = name;

    this.fullName = parent
      ? `${parent.fullName}.${name}`
      : `${parentFile.packageName}.${name}`;

    this.parentFile = parentFile;
    this.parent = parent;

    // TODO is this correct for nested messages?, or is the parent name missing?
    // how to handle nested messages?
    // are they containing the parent name or not? Document that here!
    let relFullName = this.fullName.slice(parentFile.packageName.length + 1); // +1 for the dot
    this.jsIdent = parentFile.jsImportPath.ident(relFullName);

    this.location = findLocation(parentFile.proto, path);

    let enumValuesProto = proto.getValueList();
    for (let i = 0; i < enumValuesProto.length; i++) {
      let valuePath = [...path, 2, i]; // 2 is the field number for `value` in EnumDescriptorProto
      this.values.push(new EnumValue(enumValuesProto[i], this, valuePath));
    }
  }
}

/**
 * Proto enum value options.
 *
 * This is the ``protogen`` equivalent to the protobuf EnumOptions type. The
 * attributes are obtained from the protobuf EnumOptions and exposed in this type
 * for easier access.
 */
export class EnumOptions {
  /* The raw protobuf EnumOptions. */
  proto: descriptor_pb.EnumOptions | null;

  /* If `true` allows mappings from different tag names to the same value. */
  allowAlias: boolean | undefined;

  /* If `true` the enum value is deprecated. Defaults to `false`. */
  deprecated: boolean;

  constructor(proto: descriptor_pb.EnumOptions | null) {
    this.proto = proto;
    this.allowAlias = proto?.getAllowAlias();
    this.deprecated = proto?.getDeprecated() ?? false;
  }

  /**
   * Get a enum extension.
   *
   * @param handle The extension handle.
   * @returns The extension value if present on the enum. `null` otherwise.
   */
  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * A proto enum value.
 *
 * This is the ``protogen`` equivalent to a protobuf EnumValueDescriptor. The
 * enum values attributes are obtained from the EnumValueDescriptor it is derived
 * from and references to other ``protogen`` classes that have been resolved in
 * the resolution process. It represents a Protobuf enum value declared within an
 * Protobuf enum definition.
 */
export class EnumValue {
  /* The raw EnumValueDescriptor of the enum value. */
  readonly proto: descriptor_pb.EnumValueDescriptorProto;

  /* Proto name of the enum value. */
  readonly name: string;

  /**
   * Full proto name of the enum value. Note that full names of enum values
   * are different: All other proto declarations are in the namespace of
   * their parent. Enum values however are within the namespace of ther
   * parent file.  An enum value named ``FOO_VALUE`` declared within an enum
   * ``proto.package.MyEnum`` has a full name of ``proto.package.FOO:VALUE``.
   */
  readonly fullName: string;

  /* The enum number. */
  readonly enumNumber: number;

  /* The enum the enum value is declared in. */
  readonly parent: Enum;

  /* Options specified on the enum value. */
  readonly options: EnumValueOptions;

  /* Comments associated with the enum value. */
  readonly location: Location;

  constructor(
    proto: descriptor_pb.EnumValueDescriptorProto,
    parent: Enum,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new EnumValueOptions(proto.getOptions() ?? null);
    this.parent = parent;

    // EnumValue full names are special: always within the namespace
    // of the parent file, and not within the namespace of the enum.
    let shortName = proto.getName();
    if (!shortName)
      throw new Error(
        `enum ${parent.fullName}, value index ${
          path[-1]
        }: no name in EnumValueDescriptor.`
      );
    this.name = shortName;
    this.fullName = `${parent.parentFile.packageName}.${shortName}`;

    // proto.getNumber might return undefined. In that case, 0 is assumed.
    let enumNumber = proto.getNumber() || 0;
    this.enumNumber = enumNumber;

    this.location = findLocation(parent.parentFile.proto, path);
  }
}

/**
 * Proto enum value options.
 *
 * This is the ``protogen`` equivalent to the protobuf EnumValueOptions type. The
 * attributes are obtained from the protobuf EnumValueOptions and exposed in
 * this type for easier access.
 */
export class EnumValueOptions {
  /* The raw protobuf EnumValueOptions. */
  proto: descriptor_pb.EnumValueOptions | null;

  /* If `true` the enum value is deprecated. Defaults to `false`. */
  deprecated: boolean;

  constructor(proto: descriptor_pb.EnumValueOptions | null) {
    this.proto = proto;
    this.deprecated = proto?.getDeprecated() ?? false;
  }

  /**
   * Get a enum value extension.
   *
   * @param handle The extension handle.
   * @returns The extension value if present on the enum value. `null` otherwise.
   */
  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * A proto Oneof.
 *
 * This is the ``protogen`` equivalent to a protobuf OneofDescriptor. The
 * oneofs attributes are obtained from the OneofDescriptor it is derived from
 * and references to other ``protogen`` classes that have been resolved in the
 * resolution process. It represents a Protobuf oneof declared within a
 * Protobuf message definition.
 */
export class Oneof {
  /* The raw OneofDescriptor of the oneof. */
  readonly proto: descriptor_pb.OneofDescriptorProto;

  /* Proto name of the oneof. */
  readonly name: string;

  /* The message the oneof is declared in. */
  readonly parent: Message;

  /* Fields that are part of the oneof. */
  readonly fields: Field[] = [];

  /* Options specified on the oneof. */
  readonly options: OneofOptions;

  /* Comments associated with the oneof. */
  readonly location: Location;

  constructor(
    proto: descriptor_pb.OneofDescriptorProto,
    parent: Message,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new OneofOptions(proto.getOptions() ?? null);
    let name = proto.getName();
    if (!name) throw new Error("Initializing message with no name."); // TODO(fischor): better error message
    this.name = name;
    this.parent = parent;
    this.location = findLocation(parent.parentFile.proto, path);
  }

  // no resolve or register function here. Fields will be added
  // by the message that created the oneof.
}

/**
 * Proto oneof options.
 *
 * This is the ``protogen`` equivalent to the protobuf OneofOptions type. The
 * attributes are obtained from the protobuf OneofOptions and exposed in this
 * type for easier access.
 */
export class OneofOptions {
  /* The raw protobuf OneofOptions. */
  proto: descriptor_pb.OneofOptions | null;

  constructor(proto: descriptor_pb.OneofOptions | null) {
    this.proto = proto;
  }

  /**
   * Get a oneof extension.
   *
   * @param handle The extension handle.
   * @returns The extension value if present on the oneof. `null` otherwise.
   */
  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * A proto field.
 *
 * This is the ``protogen`` equivalent to a protobuf FieldDescriptor. The
 * fields attributes are obtained from the FieldDescriptor it is derived from
 * and references to other ``protogen`` classes that have been resolved in the
 * resolution process. It represents a Protobuf field declared within a
 * Protobuf message definition. It is also used to describe protobuf extensions.
 */
export class Field {
  /* The raw FieldDescriptor of the field. */
  readonly proto: descriptor_pb.FieldDescriptorProto;

  /* Proto name of the field. */
  readonly name: string;

  /* Full proto name of the field. */
  readonly fullName: string;

  /* JSON name of the field. */
  readonly jsonName: string;

  /* The field number. */
  readonly number: number;

  /* The message the field is declared in. Or `null` for top-level extensions. */
  readonly parent: Message | null;

  /* The file the field is declared in. */
  readonly parentFile: File;

  /* The oneof in case the field is contained in a oneof. `null` otherwise. */
  readonly oneof: Oneof | null;

  /* The field kind. */
  readonly kind: Kind;

  /* Cardinality of the field. */
  readonly cardinality: Cardinality;

  /**
   * The enum type of the field in case the fields kind is `Kind.ENUM`. `null`
   * otherwise.
   */
  readonly enumType: Enum | null = null; // set after resolve

  /**
   * The message type of the field in case the fields kind is `Kind.MESSAGE`.
   * `null` otherwise.
   */
  readonly message: Message | null = null; // set after resolve

  /* The extendee in case this is a top-level extension. `null` otherwise. */
  readonly extendee: Message | null = null; // set after resolve

  /* Options specified on the field. */
  readonly options: FieldOptions;

  /* Comments associated with the field. */
  readonly location: Location;

  constructor(
    proto: descriptor_pb.FieldDescriptorProto,
    parent: Message | null,
    parentFile: File,
    oneof: Oneof | null,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new FieldOptions(proto.getOptions() ?? null);

    let name = proto.getName();
    if (!name) throw new Error("field name not populated");
    this.name = name;

    if (parent != null) {
      this.fullName = `${parent.fullName}.${this.name}`;
    } else {
      // For top-level extensions.
      // TODO(fischor): whats supposed to be the full name of an extension field?
      this.fullName = `${parentFile.packageName}.${this.name}`;
    }
    let jsonName = proto.getJsonName() || "";
    this.jsonName = normaliseFieldObjectName(camelCase(jsonName));

    let number = proto.getNumber();
    if (!number)
      throw new Error(`field ${this.fullName}: number not populated`);
    this.number = number;

    this.parentFile = parentFile;
    this.parent = parent;
    let protoType = proto.getType();
    if (!protoType)
      throw new Error(`field {this.fullName}: type not populated`);
    this.kind = kind(protoType);
    this.oneof = oneof;
    this.location = findLocation(parentFile.proto, path);

    switch (proto.getLabel() || 0) {
      case 1:
        this.cardinality = Cardinality.Optional;
        break;
      case 2:
        this.cardinality = Cardinality.Required;
        break;
      case 3:
        this.cardinality = Cardinality.Repeated;
        break;
      default:
        throw new Error(
          `field ${this.fullName}: unrecognized label ${proto.getLabel()}`
        );
    }
  }

  _resolve(reg: Registry) {
    // Resolve enumType or message.
    let typeName = this.proto.getTypeName();
    if (typeName && typeName != "") {
      // @ts-ignore
      this.enumType = resolveEnumTypeName(reg, this.fullName, typeName);
      if (this.enumType == null) {
        // @ts-ignore
        this.message = resolveMessageTypeName(reg, this.fullName, typeName);
      }
      // If both are null something went wrong.
      if (this.enumType == null && this.message == null) {
        // Neither enum nor message with that name found.
        throw new Error(
          `No message or enum found for type_name=${typeName} in "${
            this.parent ? this.parent.name : "top-level"
          }".`
        );
      }
    }
    // For extensions, resolve the extendee. It is resolved in the same
    // ways type_name is resolved.
    let extendee = this.proto.getExtendee();
    if (extendee && extendee != "") {
      // @ts-ignore
      this.extendee = resolveMessageTypeName(reg, this.fullName, extendee);
      if (this.extendee == null) {
        throw new Error(
          `Extendee not found in type registry: extendee=${extendee} in ${
            this.parent ? this.parent.name : "top-level"
          }.`
        );
      }
    }
  }

  /**
   * Whether the field is a map field.
   *
   * @returns `true` if the field is a map field. `false` otherwise.
   */
  isMap(): boolean {
    if (this.message == null) {
      return false;
    }
    let mapEntry = this.message.options.mapEntry;
    if (mapEntry != undefined) {
      return mapEntry;
    }
    return false;
  }

  /**
   * Whether the field is a list field.
   *
   * A list field has a cardinality of `Cardinality.REPEATED` and is not a map
   * field.
   *
   * @returns `true` if the field is a list field. `false` otherwise.
   */
  isList(): boolean {
    return this.cardinality == Cardinality.Repeated && !this.isMap();
  }

  /**
   * Return the map key if the is a map field.
   *
   * @returns the field of the map key if `isMap` is `true`. `null` otherwise.
   */
  mapKey(): Field | null {
    if (!this.isMap()) return null;
    // The map key is always the first field in the autogenerated Message for
    // that map.
    return this.message!.fields[0];
  }

  /**
   * Return the map value if the is a map field.
   *
   * @returns the field of the map value if `isMap` is `true`. `null` otherwise.
   */
  mapValue(): Field | null {
    if (!this.isMap()) return null;
    // The map value is always the second field in the autogenerated Message for
    // that map.
    return this.message!.fields[1];
  }
}

/**
 * Proto field options.
 *
 * This is the ``protogen`` equivalent to the protobuf FieldOptions type. The
 * attributes are obtained from the protobuf FieldOptions and exposed in this
 * type for easier access.
 */
export class FieldOptions {
  /* The raw protobuf FieldOptions. */
  proto: descriptor_pb.FieldOptions | null;

  /* For C++: representation type of the field. Defaults to CType.STRING. */
  ctype: descriptor_pb.FieldOptions.CType;

  /**
   * The packed option can be enabled for repeated primitive fields to enable
   * a more efficient representation on the wire.
   */
  packed: boolean | undefined;

  /**
   * The JavaScript type used for values of the field. The option is permitted
   * only for 64 bit integral and fixed types (int64, uint64, sint64, fixed64,
   * sfixed64).  A field with jstype JS_STRING is represented as JavaScript
   * string, which avoids loss of precision that can happen when a large value
   * is converted to a floating point JavaScript. Specifying JS_NUMBER for the
   * jstype causes the generated JavaScript code to use the JavaScript "number"
   * type. The behavior of the default option JS_NORMAL is implementation
   * dependent.
   **/
  jstype: descriptor_pb.FieldOptions.JSType;

  /* If `true` the field should be parsed lazily. Defaults to `false`. */
  lazy: boolean;

  /* If `true` the field is deprecated. Defaults to `false`. */
  deprecated: boolean;

  constructor(proto: descriptor_pb.FieldOptions | null) {
    this.proto = proto;
    this.ctype = proto?.getCtype() ?? descriptor_pb.FieldOptions.CType.STRING;
    this.packed = proto?.getPacked();
    this.jstype =
      proto?.getJstype() ?? descriptor_pb.FieldOptions.JSType.JS_NORMAL;
    this.lazy = proto?.getLazy() ?? false;
    this.deprecated = proto?.getDeprecated() ?? false;
  }

  /**
   * Get a field extension.
   *
   * @param handle The extension handle.
   * @returns The extension value if present on the field. `null` otherwise.
   */
  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * A protobuf extension.
 *
 * Protobuf extensions are described using FieldDescriptors. See {@link Field}.
 */
export type Extension = Field;

/**
 * A JavaScript import path.
 *
 * Represents a JavaScript import path as used in a JavaScript import statement.
 * In JavaScript, the import path is used to identify the module to import. One
 * has to differentiate import paths from a module distributed via npm to import
 * paths pointing to local modules.
 * An import path of "google-protobuf/google/protobuf/timestamp_pb" refers to the
 * module "google/protobuf/timestamp_pb.js" that is part of the "google-protobuf"
 * npm package.
 * An import path of "../mypackage/mymodule" refers the "../mypackage/mymodule.js"
 * module thats present locally with respect to the current module.
 *
 * This is just a simple wrapper class around an import path. It is used in the
 * `GeneratedFile` to keep track of which import statements need to be included
 * in the output of the generated file as well as how a `JSIdent` needs to be
 * referred to in the output the generated file.
 *
 * Example:
 * Use the `JSImportPath` class to take advantage of the import resolution
 * mechanism provided by the `GeneratedFile`.
 *
 * ```typescript
 * import * as protogen from "protogenerate";
 * grpcPkg = protogen.JSImportPath("", "@grpc/grpc-js", "");
 * // g is of type GeneratedFile
 * g.P("class MyService {")
 * g.P("constructor() {")
 * g.P("this.channel = new", grpcPkg.ident("Channel"), "('localhost:9090');")
 * g.P("}")
 * g.P()
 * // ..
 * g.P("}")
 * ```
 *
 * That way the `@grpc/grpc-js` package will be automatically added to the import
 * list of `g`.
 */
export class JSImportPath {
  /**
   * Create a new JavaScript import path.
   *
   * @param path The local import path that is the relative path to the module
   * import path refers to without an extension.
   * @param npmModule Optional. The npm package name if the import path refers
   * to a npm package.
   * @param npmPathUnderModule Optional. The path under the npm package the
   * module can be imported from. E.g. for the npm package  "google-protobuf" a
   * `npmPathUnderPackage` of "google/protobuf/timestamp_pb" might be necessary
   * to import any identifiers in the "timestamp_pb.js" module as these are not
   * exported in the top-level index.js file.
   * The complete import path necessary to import the `Timestamp` identifer is
   * `google-protobuf/google/protobuf/timestamp_pb` as in
   * `import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb";`.
   */
  constructor(
    public readonly path: string,
    public readonly npmModule: string,
    public readonly npmPathUnderModule: string = ""
  ) {}

  ident(name: string): JSIdent {
    return new JSIdent(this, name);
  }

  equals(other: JSImportPath): boolean {
    return this.npmModule == other.npmModule && this.path == other.path;
  }
}

/**
 * The Cardinality specifies whether a field is optional, required or repeated.
 */
export enum Cardinality {
  Optional = 1,
  Required = 2,
  Repeated = 3,
}

/**
 * A proto location.
 *
 * A Location identifies a piece of source code in a .proto file which
 * corresponds to a particular definition.  This information is particular
 * useful as it contains the comments that are associated with a certain part
 * (e.g. a message or field) of the ``.proto`` file.
 *
 * The following example explains the different kind of comments:
 *
 * ```proto
 * // Comment attached to bar.
 * optional int32 bar = 2;

 * optional string baz = 3;
 * // Comment attached to baz.
 * // Another line attached to baz.

 * // Comment attached to qux.
 * //
 * // Another line attached to qux.
 * optional double qux = 4;

 * // Detached comment for corge. This is not leading or trailing comments
 * // to qux or corge because there are blank lines separating it from
 * // both.

 * // Detached comment for corge paragraph 2.

 * optional string corge = 5;
 * /* Block comment attached
 * * to corge.  Leading asterisks
 * * will be removed. *\/
 * /* Block comment attached to
 * * grault. *\/
 * optional int32 grault = 6;

 * // ignored detached comments.
 * ```
 */
export class Location {
  constructor(
    /* Name of the file the location is from. */
    public readonly sourceFile: string, // this is not in the Location proto
    /* Identifies which part of the FileDescriptor was defined at the location. */
    public readonly path: number[],
    /**
     * Comments that are leading to the current location and detached from it
     * by at least one blank line.
     */
    public readonly leadingDetached: string[],
    /**
     * Comments directly attached (leading) to the location. Not separated with
     * a blank line.
     * */
    public readonly leading: string,
    /**
     * Comments directly attached (leading) to the location. Not separated with
     * a blank line.
     * */
    public readonly trailing: string
  ) {}
}

/**
 * Kind is an enumeration of the different value types of a field.
 */
export enum Kind {
  Double = 1,
  Float = 2,
  Int64 = 3,
  Uint64 = 4,
  Int32 = 5,
  Fixed64 = 6,
  Fixed32 = 7,
  Bool = 8,
  String = 9,
  Group = 10,
  Message = 11,
  Bytes = 12,
  Uint32 = 13,
  Enum = 14,
  Sfixed32 = 15,
  Sfixed64 = 16,
  Sint32 = 17,
  Sint64 = 18,
}

export function kind(n: number): Kind {
  return n;
}

/**
 * An identifier for a JavaScript class, function, variable or constant (or a
 * TypeScript type or interface).
 */
export class JSIdent {
  /**
   * The import path of the identifier.
   */
  importPath: JSImportPath;

  /**
   * Name of the class, function, variable or constant.
   */
  name: string;

  constructor(importPath: JSImportPath, name: string) {
    this.importPath = importPath;
    this.name = name;
  }
}
