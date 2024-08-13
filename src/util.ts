/***************************************************************************************************
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 **************************************************************************************************/

import * as ini from "ini";
import { promises as fs } from "fs";
import * as core from "@actions/core";
import * as path from "path";
import * as io from "@actions/io";
import * as os from "os";

async function findStorageDriver(filePaths: string[]): Promise<string> {
    let storageDriver = "";
    for (const filePath of filePaths) {
        core.debug(`Checking if the storage file exists at ${filePath}`);
        if (await fileExists(filePath)) {
            core.debug(`Storage file exists at ${filePath}`);
            const fileContent = ini.parse(await fs.readFile(filePath, "utf-8"));
            if (fileContent.storage.driver) {
                storageDriver = fileContent.storage.driver;
            }
        }
    }
    return storageDriver;
}

export async function isStorageDriverOverlay(): Promise<boolean> {
    let xdgConfigHome = path.join(os.homedir(), ".config");
    if (process.env.XDG_CONFIG_HOME) {
        xdgConfigHome = process.env.XDG_CONFIG_HOME;
    }
    const filePaths: string[] = [
        "/etc/containers/storage.conf",
        path.join(xdgConfigHome, "containers/storage.conf"),
    ];
    const storageDriver = await findStorageDriver(filePaths);
    return (storageDriver === "overlay");
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    }
    catch (err) {
        return false;
    }
}

export async function findFuseOverlayfsPath(): Promise<string | undefined> {
    let fuseOverlayfsPath;
    try {
        fuseOverlayfsPath = await io.which("fuse-overlayfs");
    }
    catch (err) {
        if (err instanceof Error) {
            core.debug(err.message);
        }
    }

    return fuseOverlayfsPath;
}

export function splitByNewline(s: string): string[] {
    return s.split(/\r?\n/);
}

export function isFullImageName(image: string): boolean {
    return image.indexOf(":") > 0;
}

export function getFullImageName(image: string, tag: string): string {
    if (isFullImageName(tag)) {
        return tag;
    }
    return `${image}:${tag}`;
}

export function isNamespace(image: string): boolean {
    return image.indexOf("/") > 0;
}

export function isRegistryDomain(image: string): boolean {
    // naively checks if the registry is a domain
    if (isNamespace(image)) {
        const registry = image.split("/")[0];
        return registry.indexOf(".") > 0 && !registry.endsWith(".");
    }
    return false;
}

export function isRegistryLocalhost(image: string): boolean {
    if (isNamespace(image)) {
        const registry = image.split("/")[0];
        return registry === "localhost";
    }
    return false;
}

export function isNameFullyQualified(image: string): boolean {
    if (isFullImageName(image)) {
        return isRegistryDomain(image);
    }
    return false;
}

export function getImageName(image: string): string {
    const imageParts = image.split("/");

    switch (true) {
    case (imageParts.length <= 2):
        if (isRegistryLocalhost(image) || isRegistryDomain(image)) {
            return imageParts.slice(1).join("/");
        }
        return image;
    case (isRegistryLocalhost(image)):
        return imageParts.slice(1).join("/");
    case (isRegistryDomain(image)):
        return imageParts.slice(2).join("/");
    default:
        return image;
    }
}

const DOCKER_IO = `docker.io`;
const DOCKER_IO_NAMESPACED = DOCKER_IO + `/library`;

export function getFullDockerImageName(image: string): string {
    // docker does not store images with localhost/
    // so we get the base image name if it is prepended with localhost/
    const sanitizedImageName = isRegistryLocalhost(image) ? getImageName(image) : image;
    const imagePartsLength = sanitizedImageName.split("/").length;

    switch (true) {
    case (isNameFullyQualified(sanitizedImageName)):
        // if the docker image is in the form of `registry/image:tag`,
        // then it is pulled to podman as the same name
        return sanitizedImageName;
    case (imagePartsLength === 1):
        // if image is in the form of `image:tag`,
        // podman pulls it as `docker.io/library/image:tag`
        return `${DOCKER_IO_NAMESPACED}/${sanitizedImageName}`;
    default:
        // otherwise, if the image is in the form of `namespace/image:tag`,
        // podman pulls it as `docker.io/namespace/image:tag`
        return `${DOCKER_IO}/${sanitizedImageName}`;
    }
}
