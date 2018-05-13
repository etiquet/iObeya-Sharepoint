/*** Vérifie si un point appartient ou non à un rectangle ***/
function isPointInRectangle(x, y, left, top, right, bottom) {
    var result = false;
    if (between(left, x, right) && between(top, y, bottom)) {
        result = true;
    }
    return result;
}

/*** Vérifie si un nombre appartient à un intervalle donné (bornes incluses) ***/
function between(min, p, max) {
    var result = false;

    if (min < max) {
        if (p > min && p < max) {
            result = true;
        }
    }

    if (min > max) {
        if (p > max && p < min) {
            result = true;
        }
    }

    // TODO relecteur : confirmer si === ou == 
    if (p === min || p === max) {
        result = true;
    }

    return result;
}

/*** Vérifie si des éléments (tous sauf rouleaux) chevauchent le rectangle (x1, y1, x2, y2) ***/
function findElementsInRectangle(x1, y1, x2, y2, iObeyaNodes) {
    return findNodesInRectangle(x1, y1, x2, y2, iObeyaNodes, isNotRoll);
}

/*** Vérifie si des étiquettes "Ressource" chevauchent le rectangle (x1, y1, x2, y2) ***/
function findActorsInRectangle(x1, y1, x2, y2, iObeyaNodes) {
    return findNodesInRectangle(x1, y1, x2, y2, iObeyaNodes, isActorLabel);
}

/*** Retourne tous les éléments qui sont au dessus du post-it ***/
function findOverlappingElements(note, iObeyaNodes) {

    var overLappingElements = Array();


    if (note === undefined)  // code défensif  
        return overLappingElements;
    if (note === null)  // code défensif  
        return overLappingElements;
    if (!note.hasOwnProperty("x"))  // code défensif
        return overLappingElements;

    var foundElements = findNodesInRectangle(note.x, note.y, note.x + note.width, note.y + note.height, iObeyaNodes, isNotNote);

    // Ne conserver que les éléments situés "au-dessus" du post-it
    // Vérifier sur les elements sont bien dans le même tableau que la note
    for (i in foundElements) {
        if (foundElements[i].boardid == note.boardid && isNotRoll(foundElements[i])) {

            console.log("board: " + note.boardname
                    + " note: " + note.props.title
                    + " node type: " + foundElements[i]['@class']
                    + " node name: " + foundElements[i].setName
                    );
            foundElements[i].noteid = note.id; // on y ajoute des propriétés utiles pour d'autres methodes
            foundElements[i].notetitle = note.props.content;
            overLappingElements.push(foundElements[i]);
        }
    }

    return overLappingElements;
}

/*
 * Retourne la/les notes qui est/sont en dessous du post-it, fonction recursive
 * @param {type} note
 * @param {type} iObeyaNodes
 * @returns {findOverlappingNotes.overLappingElements}
 */

function findOverlappingNotes(overLappingElements, note, iObeyaNodes) {

    var foundElements = findNodesInRectangle(note.x, note.y, note.x + note.width, note.y + note.height, iObeyaNodes, isNote, note.boardid);

    for (i in foundElements) {
        if (foundElements[i].boardid === note.boardid && (foundElements[i].id !== note.id)) { // loop + filtre le panneau et  la note elle même 

            foundElements[i].noteid = note.id; // on y ajoute des propriétés utiles pour d'autres methodes
            foundElements[i].notetitle = note.props.content; // idems

            overLappingElements.sort(function (obj1, obj2) {
                return parseInt(obj1.zOrder) - parseInt(obj2.zOrder); // l'élément le plus en profondeur => en premier.
            });

            if (foundElements[i].zOrder > note.zOrder) {// seulement les éléments au dessus 
                overLappingElements.push(foundElements[i]);
                overLappingElements = findOverlappingNotes(overLappingElements, foundElements[i], iObeyaNodes); // recursif
            }

        }
    }

    return overLappingElements;
}

/*
 * Vérifie si des noeuds vérifiant la condition donnée chevauche le rectangle (x1, y1, x2, y2
 * @param {type} x1
 * @param {type} y1
 * @param {type} x2
 * @param {type} y2
 * @param {type} iObeyaNodes : la liste des noeuds iObeya
 * @param {type} conditionTestFunction : la fonction qui permet de filtrer la nature des objects 
 * @param {type} boardId : l'id du panneau de recherche ( optionnel )
 * @returns {findNodesInRectangle.result}
 */
function findNodesInRectangle(x1, y1, x2, y2, iObeyaNodes, conditionTestFunction, boardId = null) {
    var result = Array();

    for (var id in iObeyaNodes) {
        var iObeyaObject = iObeyaNodes[id];

        if (conditionTestFunction(iObeyaObject)) { // on utilise la fonction qui est passé en paramètre pour tester la nature de l'objet
            var chk = isRectanglesIntersectionNotNull(x1, y1, x2, y2, iObeyaObject.x, iObeyaObject.y, iObeyaObject.x + iObeyaObject.width, iObeyaObject.y + iObeyaObject.height);

            var chk2 = true;
            if (boardId != null) {
                if (iObeyaObject.boardid !== boardId)
                    var chk2 = false;
            }

            if (chk && chk2) {
                result.push(iObeyaObject);
            }
        }
    }

    return result;
}

/*
 * Vérifie si l'intersection entre deux rectangles  1 et 2 est vide ou non
 * @param {type} x1_1
 * @param {type} y1_1
 * @param {type} x2_1
 * @param {type} y2_1
 * @param {type} x1_2
 * @param {type} y1_2
 * @param {type} x2_2
 * @param {type} y2_2
 * @returns {Boolean}
 */

function isRectanglesIntersectionNotNull(x1_1, y1_1, x2_1, y2_1, x1_2, y1_2, x2_2, y2_2) {

    // Sommets du rectangle dans l'étiquette
    var chk1 = isPointInRectangle(x1_1, y1_1, x1_2, y1_2, x2_2, y2_2);
    var chk2 = isPointInRectangle(x1_1, y2_1, x1_2, y1_2, x2_2, y2_2);
    var chk3 = isPointInRectangle(x2_1, y2_1, x1_2, y1_2, x2_2, y2_2);
    var chk4 = isPointInRectangle(x2_1, y1_1, x1_2, y1_2, x2_2, y2_2);

    // Etiquette dans les sommets du rectangle
    var chk5 = isPointInRectangle(x1_2, y1_2, x1_1, y1_1, x2_1, y2_1);
    var chk6 = isPointInRectangle(x1_2, y2_2, x1_1, y1_1, x2_1, y2_1);
    var chk7 = isPointInRectangle(x2_2, y2_2, x1_1, y1_1, x2_1, y2_1);
    var chk8 = isPointInRectangle(x2_2, y1_2, x1_1, y1_1, x2_1, y2_1);

    return (chk1 || chk2 || chk3 || chk4 || chk5 || chk6 || chk7 || chk8);
}


/*** Vérifie si l'origine d'un post-it est présente à la position (x,y) ***/
function findNoteAtPosition(x, y, iObeyaNodes) {
    for (var id in iObeyaNodes) {
        var iObeyaObject = iObeyaNodes[id];
        if (
                iObeyaObject['@class'] === "com.iobeya.dto.BoardNoteDTO" ||
                iObeyaObject['@class'] === "com.iobeya.dto.BoardCardDTO"
                ) {//TODO modifié 
            var chk1 = (x == iObeyaObject.x && y == iObeyaObject.y);
            if (chk1) {
                return iObeyaObject.id;
            }
        }
    }
    return -1;
}

/*** Retourne vrai si l'élément passé en paramètre est une étiquette de "Reponsable" ***/
function isActorLabel(iObeyaObject) {
    return iObeyaObject['@class'] === "com.iobeya.dto.BoardLabelDTO" && iObeyaObject.backgroundColor == LABEL_DEFAULT_COLOR;
}

/*** Retourne vrai si l'élément passé en paramètre est un sticker "% achevé" ***/
function isPercentCompleteSticker(iObeyaObject) {
    return iObeyaObject['@class'] === "com.iobeya.dto.BoardStickerDTO" && iObeyaObject.setName.startsWith(PERCENTAGE_IOBEYASTICKER_MAPPING.setName);
}

/*** Retourne vrai si l'élément passé en paramètre est un sticker "Priorité" ***/
function isPrioritySticker(iObeyaObject) {
    return iObeyaObject['@class'] === "com.iobeya.dto.BoardStickerDTO" && iObeyaObject.setName.startsWith(PRIORITY_IOBEYASTICKER_MAPPING.setName);
}

/*** Retourne vrai si l'élément passé en paramètre est une étiquette de "Statut" ***/
function isStatusLabel(iObeyaObject) {
    return iObeyaObject['@class'] === "com.iobeya.dto.BoardLabelDTO" && iObeyaObject.backgroundColor != LABEL_DEFAULT_COLOR;
}

/*** Retourne vrai si l'élément passé en paramètre n'est pas une card / note  ***/
function isNotNote(iObeyaObject) {
    return (
            iObeyaObject['@class'] !== "com.iobeya.dto.BoardNoteDTO" &&
            iObeyaObject['@class'] !== "com.iobeya.dto.BoardCardDTO"
            );
}

/*** Retourne vrai si l'élément passé en paramètre est pas une card / note  ***/
function isNote(iObeyaObject) {
    return (!isNotNote(iObeyaObject));
}

/*** Retourne vrai si l'élément passé en paramètre n'est pas un rouleau ***/
function isNotRoll(iObeyaObject) {
    return iObeyaObject['@class'] !== "com.iobeya.dto.BoardRollDTO";
}

/*** Retourne vrai si l'élément passé en paramètre est un sticker "Link" ***/
function isEscallation(iObeyaObject) {
    return iObeyaObject['@class'] === "com.iobeya.dto.BoardStickerDTO"
            && iObeyaObject.setName.startsWith(ESCALLATION_MAPPING.setName);
}


/*** Retourne le zOrder maximum d'une liste de noeuds ***/
function maxZOrder(iObeyaNodes) {
    var lastZOrder = 0;
    for (var i = 0; i < iObeyaNodes.length; i++) {
        if (!isNaN(iObeyaNodes[i].zOrder)) {
            // Calcul du zOrder à affecter
            lastZOrder = Math.max(lastZOrder, iObeyaNodes[i].zOrder + 1);
        }
    }
    return lastZOrder;
}

/*** Trie le tableau d'éléments iObeya par zOrder, puis leur réassigne de nouveaux zOrders ***/
function refreshZOrders(iObeyaNodes) {
    // Tri
    iObeyaNodes.sort(compareZOrders);

    // Nouveaux zOrders
    for (i = 0; i < iObeyaNodes.length; i++) {
        iObeyaNodes[i].zOrder = i + 1;
    }

    return iObeyaNodes;
}

/*** Compare les zOrders de deux éléments iObeya ***/
function compareZOrders(x, y) {
    return y.zOrder - x.zOrder;
}