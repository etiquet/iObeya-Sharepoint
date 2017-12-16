/**
 * Recherche d'éléments dans iObeya
 */

/*** Retourne le roll iObeya associé au label possédant le nom renseigné dans le board ***/

function findRollbyLabelName(iObeyaNodes, name, boardid) {
    var l_boardid, l_name, i, j, label, contentLabel, roll;

    try {

        if (name === null) {
            l_name = "";
        } else {
            l_name = name.toLocaleUpperCase();
        }
        l_boardid = boardid;

        for (i in iObeyaNodes) { // on scanne la liste de node iObeya
            label = iObeyaNodes[i];
            if (label['@class'] === "com.iobeya.dto.BoardLabelDTO" && l_boardid == iObeyaNodes[i].boardid) { // on recherche le label dans le board cible.
                contentLabel = label.contentLabel.toLocaleUpperCase();
                if (contentLabel === l_name) { // Le roll porte le nom recherché
                    for (j in iObeyaNodes) {
                        roll = iObeyaNodes[j];
                        if (roll['@class'] === "com.iobeya.dto.BoardRollDTO" && l_boardid == iObeyaNodes[j].boardid) { // on recherche le roll dans le board cible.
                            // Vérifie que le label est inclus dans le roll
                            if (isPointInRectangle(label.x + label.width / 2, label.y + label.height / 2,
                                    roll.x, roll.y, roll.x + roll.width, roll.y + roll.height)) {
                                return roll;
                            }
                        }
                    }
                }
            }
        }

        if (name === DROP_ZONE) {
            // Si la zone par défaut n'a pas été trouvée, erreur
            throw new InterfaceException("La zone \"" + DROP_ZONE + "\" n'a pas été trouvée dans iObeya.");
        }

        return findRollbyLabelName(iObeyaNodes, DROP_ZONE, l_boardid); // Si aucune zone n'a été trouvé, on place dans la DropZone (appel récursif)
    } catch (e) {
        throw e;
    }
}

/*** Retourne l'étiquette "Acteur" associée au post-it ***/
function getAssociatedLabel(overlappingElements) {
    var i;
    for (i in overlappingElements) {
        if (isActorLabel(overlappingElements[i])) {
            return overlappingElements[i];
        }
    }
    return null;
}

/*** Retourne le sticker "% achevé" associé au post-it ***/
function getAssociatedPercentCompleteSticker(overlappingElements) {
    var i;
    for (i in overlappingElements) {
        if (isPercentCompleteSticker(overlappingElements[i])) {
            return overlappingElements[i];
        }
    }
    return null;
}

/*** Retourne le sticker "Priorité" associé au post-it ***/
function getAssociatedPrioritySticker(overlappingElements) {
    var i;
    for (i in overlappingElements) {
        if (isPrioritySticker(overlappingElements[i])) {
            return overlappingElements[i];
        }
    }
    return null;
}

/*** Retourne le sticker "Escallation" associé au post-it ***/
function getAssociatedEscallationSticker(overlappingElements) {
    for (var i in overlappingElements) {
        if (isEscallation(overlappingElements[i])) {
            return overlappingElements[i];
        }
    }
    return null;
}

/*** Retourne la date de dernière modification d'un post-it et des éléments qui le chevauchent ***/
function getNoteLastModificationDate(iObeyaObject, iObeyaNodes) {
    var lastDate = null, iObeyaOverlapping;

    // Post-it
    if (iObeyaObject.creationDate !== null) {
        lastDate = iObeyaObject.creationDate;
    }
    if (iObeyaObject.modificationDate !== null) {
        lastDate = Math.max(lastDate, iObeyaObject.modificationDate);
    }

    // Eléments superposés
    iObeyaOverlapping = findOverlappingElements(iObeyaObject, iObeyaNodes);

    if (iObeyaOverlapping)
        for (var i in iObeyaOverlapping) {
            if (iObeyaOverlapping[i].creationDate !== null) {
                lastDate = Math.max(lastDate, iObeyaOverlapping[i].creationDate);
            }
            if (iObeyaOverlapping[i].modificationDate !== null) {
                lastDate = Math.max(lastDate, iObeyaOverlapping[i].modificationDate);
            }
        }
    return lastDate;
}


/**
 * Traitement des informations particulières du post-it
 */

/**
 * Détermine l'emplacement où doit se trouver l'élément iObeya ainsi que ceux qui le chevauchent
 * @param rollObject
 * @param element
 * @param nodesiObeya
 * @param overLappingElements
 * @returns {*}
 */
function placeElement(rollObject, element, nodesiObeya, overLappingElements) {
    var lastZOrder, i;

    try {
        // Initialisation position
        if (isNaN(element.x))
            element.x = 0;
        if (isNaN(element.y))
            element.y = 0;
        if (isNaN(element.zOrder))
            element.zOrder = maxZOrder(nodesiObeya) + 1;
        // Position Z
        lastZOrder = maxZOrder(nodesiObeya) + 1;

        /* TODO: 
         pb à résoudre : les nouveaux acteurs (dans le cas de refresh actor se placent à droite de tout label trouvés,
         même si le label le + à droite est situé  dans le roll au dessus  (probablement pas de filtrage en Y )
         */

        // Délimitation de la zone
        var limit = getZoneLimit(rollObject);
        // Point de départ
        var X = rollObject.x + NOTE_DEFAULT_MARGIN; // Marge à gauche
        var Y = rollObject.y + NOTE_DEFAULT_MARGIN + limit.YOffset; // Marge au-dessus

        var nextLineY = -1;

        // Détermination de la taille que va occuper le nouveau post-it ainsi que ses éléments superposés
        var size = getElementRealSize(element, overLappingElements);
        var realWidth = size.realWidth;
        var realHeight = size.realHeight;

        var placeFound = false; // Équivaut à un while(true){...; break; } Un peu sale :D
        while (!placeFound) {
            // On récupère les éléments qui chevauchent les coordonnées testées
            var elementsInRectangle = findElementsInRectangle(X, Y, X + realWidth, Y + realHeight, nodesiObeya);

            // on supprime tous les éléments de l'array qui ne sont pas sur le board cible
            // PWL Parcour de liste avec modification de la liste
            for (var elmt in elementsInRectangle) {
                if (elementsInRectangle[elmt].boardid !== element.boardid) {
                    elementsInRectangle.splice(elmt, 1)
                }
            }

            if (elementsInRectangle.length > 0 && Y + realHeight < limit.Y) {
                // Si on chevauche des éléments, et qu'on n'est pas en bas du tableau
                var otherNote = elementsInRectangle[0];
                // Nouveau X
                X = otherNote.x + otherNote.width + NOTE_DEFAULT_MARGIN;
                // Détermination du Y de la prochaine ligne
                nextLineY = Math.max(nextLineY, Y, otherNote.y + otherNote.height + NOTE_DEFAULT_MARGIN);

                if (X + realWidth >= limit.X) {
                    // Si la ligne est complète, on passe à la suivante
                    X = rollObject.x + NOTE_DEFAULT_MARGIN;
                    Y = nextLineY;
                    nextLineY = -1
                }
            } else {
                // On quitte la boucle, et on place le nouvel élément
                placeFound = true;
            }
        }

        // Plus de place sur le rouleau
        if (Y + realHeight >= limit.Y) {
            alert(`Il n'y a plus de place disponible pour afficher un élément au statut "${element.status}" du panneau "${rollObject.boardname}".`);
            return null;
        }

        // Récupération des marges dues à la position occupée par les éléments qui chevauchent le post-it
        var delta = getNoteMargin(element, overLappingElements);
        // Vecteurs des translations effectuées
        var u = X + delta.xLeft - element.x;
        var v = Y + delta.yTop - element.y;

        // Translation du post-it
        element.x += u;
        element.y += v;
        element.zOrder = lastZOrder;

        // Translation des éléments qui le chevauchent
        if (overLappingElements) {
            for (i in overLappingElements) {
                overLappingElements[i].x += u;
                overLappingElements[i].y += v;
                overLappingElements[i].zOrder = lastZOrder + 1;
            }
        }
        return element;
    } catch (e) {
        throw e;
    }
}

/*** Détermine l'emplacement où doit se trouver l'étiquette "Responsable" à la création ***/
function placeLabel(label, note) {
    label.x = note.x + note.width / 2 - label.width / 2;
    label.y = note.y - LABEL_POSITION_MARGIN_TOP;
    label.zOrder = note.zOrder + 1;

    return label;
}

/*** Détermine l'emplacement où doit se trouver le Sticker "% achevé" à la création ***/
function placePercentCompleteSticker(sticker, note) {
    sticker.x = note.x + note.width - sticker.width;
    sticker.y = note.y + note.height - sticker.height;
    sticker.zOrder = note.zOrder + 1;

    return sticker;
}

/*** Détermine l'emplacement où doit se trouver le Sticker "Priority" à la création ***/
function placePrioritySticker(sticker, note) {
    sticker.x = note.x + note.width - sticker.width / 2;
    sticker.y = note.y;
    sticker.zOrder = note.zOrder + 1;

    return sticker;
}

/*** Retourne l'aire occupée par l'ensemble (post-it, {éléments superposés}) ***/
function getElementRealSize(note, overLappingElements) {
    var size = {};

    // Récupération des marges dues à la position occupée par les éléments qui chevauchent le post-it
    var delta = getNoteMargin(note, overLappingElements);

    size.realWidth = note.width + delta.xLeft + delta.xRight;
    size.realHeight = note.height + delta.yTop + delta.yBottom;

    return size;
}

/*** Retourne les marges à gauche, droite, haut et bas induits par l'ensemble (post-it, {éléments superposés}) ***/
function getNoteMargin(note, overLappingElements) {
    var delta = Array();
    delta.xLeft = 0;
    delta.xRight = 0;
    delta.yTop = 0;
    delta.yBottom = 0;

    for (i in overLappingElements) {
        elt = overLappingElements[i];
        if (elt.x < note.x) {
            delta.xLeft = Math.max(delta.xLeft, (note.x - elt.x));
        }
        if (elt.x + elt.width > note.x + note.width) {
            delta.xRight = Math.max(delta.xRight, (elt.x + elt.width - (note.x + note.width)));
        }
        if (elt.y < note.y) {
            delta.xTop = Math.max(delta.yTop, (note.y - elt.y));
        }
        if (elt.y + elt.height > note.y + note.height) {
            delta.yBottom = Math.max(delta.yBottom, (elt.y + elt.height - (note.y + note.height)));
        }
    }

    return delta;
}

/*** Retourne les limites de la zone cible ***/
function getZoneLimit(rollObject) {
    try {
        var limit = {};

        limit.X = rollObject.x + rollObject.width;
        limit.Y = rollObject.y + rollObject.height;
        limit.YOffset = NOTE_DEFAULT_MARGIN_TOP;

        return limit;
    } catch (e) {
        throw e;
    }
}

/*** Retourne le statut de la tâche passée en paramètre ***/
function findNoteStatus(iObeyaNote, iObeyaNodes) {
    var result = {"rollObject": null, "status": ""}; // par défaut si un post-it n'est pas positionné on laisse le champs vide.
    for (var id = 0; id < iObeyaNodes.length; id++) {
        var iObeyaObject = iObeyaNodes[id];
        if (iObeyaObject['@class'] === "com.iobeya.dto.BoardRollDTO" && iObeyaNote.boardid === iObeyaNodes[id].boardid) {
            // On vérifie si la note est une note clonnée (donc pas encore positionné sur un roll)

            // On regarde si le centre du post-it appartient à la zone
            var chk1 = isPointInRectangle(iObeyaNote.x + iObeyaNote.width / 2,iObeyaNote.y + iObeyaNote.height / 2, iObeyaObject.x, iObeyaObject.y, iObeyaObject.x + iObeyaObject.width, iObeyaObject.y + iObeyaObject.height);
            if (chk1) {
                result.rollObject = iObeyaObject;

                // Recherche de la zone
                for (var idlabel = 0; idlabel < iObeyaNodes.length; idlabel++) {
                    var iObeyaObject2 = iObeyaNodes[idlabel];
                    if (isStatusLabel(iObeyaObject2)) {
                        // Recherche du statut correspondant
                        var chk2 = isPointInRectangle(iObeyaObject2.x + iObeyaObject2.width / 2, iObeyaObject2.y + iObeyaObject2.height / 2, iObeyaObject.x, iObeyaObject.y, iObeyaObject.x + iObeyaObject.width, iObeyaObject.y + iObeyaObject.height);
                        if (chk2) {
                            result.status = iObeyaObject2.contentLabel;
                            iObeyaObject.status=iObeyaObject2.contentLabel; // pour le deboggage
                            break;
                        }
                    }
                }

                break;

            }//if (chk1)
        }// same board
    }
    return result;
}



/*
 function placeElement(rollObject, element, status, iObeyaNodes, overLappingElements) {
 var lastZOrder, displayType, i,limitcatch=false;
 try {
 // Initialisation position
 if (isNaN(element.x)) { element.x = 0; }
 if (isNaN(element.y)) { element.y = 0; }
 if (isNaN(element.zOrder)) { element.zOrder = maxZOrder(iObeyaNodes) + 1; }
 
 // Position Z
 //iObeyaNodes = refreshZOrders(iObeyaNodes);
 lastZOrder = maxZOrder(iObeyaNodes) + 1;
 
 
 //TODO: 
 //	Nettoyer le code inutile // Affichage "stack"
 //	pn à résoudre : les nouveaux acteurs (dans le cas de refresh actor se placent à droite de tout label trouvés, 
 //	même si le label le + à droite est situé  dans le roll au dessus  (probablement pas de filtrage en Y )
 
 
 // Type d'affichage
 displayType = display_list ; //display_list; // Par défaut : liste
 
 for (i in stackNotes) {
 if (stackNotes[i].toUpperCase() === status.toUpperCase()) {
 displayType = display_stack; // Stack
 }
 }
 
 // Délimitation de la zone
 var limit = getZoneLimit(rollObject);
 
 // Point de départ
 var X = rollObject.x + NOTE_DEFAULT_MARGIN; // Marge à gauche
 var Y = rollObject.y + NOTE_DEFAULT_MARGIN + limit.YOffset; // Marge au-dessus
 
 var nextLineY = -1;
 
 // Détermination de la taille que va occuper le nouveau post-it ainsi que ses éléments superposés
 var size = getElementRealSize(element, overLappingElements);
 var realWidth = size.realWidth;
 var realHeight = size.realHeight;
 
 // Affichage "liste"
 
 if (displayType === display_list) {
 var elementsInRectangle = findElementsInRectangle(X, Y, X + realWidth, Y + realHeight, iObeyaNodes);
 
 // on supprime tous les éléments de l'array qui ne sont pas sur le board cible
 
 for (elmt in elementsInRectangle){
 if (elementsInRectangle[elmt].boardid != element.boardid){
 elementsInRectangle.splice(elmt,1)
 }
 }
 
 while (elementsInRectangle.length > 0 
 && Y + realHeight < limit.Y
 ) {
 var otherNote = elementsInRectangle[0];
 
 // Nouveau X
 X = otherNote.x + otherNote.width + NOTE_DEFAULT_MARGIN;
 
 // Détermination du Y de la prochaine ligne
 nextLineY = Math.max(nextLineY, Y, otherNote.y + otherNote.height + NOTE_DEFAULT_MARGIN);
 
 if (X + realWidth >= limit.X) {
 // Si la ligne est complète, on passe à la suivante
 X = rollObject.x + NOTE_DEFAULT_MARGIN;
 Y = nextLineY;
 nextLineY = -1
 }
 
 elementsInRectangle = findElementsInRectangle(X, Y, X+realWidth, Y+realHeight, iObeyaNodes);
 }
 }
 
 
 // Affichage "stack"
 if (displayType == display_stack) {
 while (findNoteAtPosition(X, Y, iObeyaNodes) != -1 && Y < limit.Y) {
 var otherNote = findNoteAtPosition(X, Y, iObeyaNodes);
 
 // Nouveau X
 X = X + NOTE_STACK_MARGIN;
 
 // Nouveau Y
 Y = Y + NOTE_STACK_MARGIN;
 if (X > rollObject.x + NOTE_DEFAULT_MARGIN && nextLineY == -1) { nextLineY = Y + otherNote.height + NOTE_DEFAULT_MARGIN; } // Détermination de l'emplacement du prochain Y de départ
 
 if (X + realWidth >= limit.X) {
 // Si la ligne est complète, on passe à la suivante
 X = rollObject.x + NOTE_DEFAULT_MARGIN;
 Y = nextLineY;
 nextLineY = -1
 }
 }
 }
 
 if (Y+realHeight >= limit.Y) {
 Y= limit.Y -realHeight ; // on scotche les objects à la limite
 X++;
 limitcatch=true;
 }
 
 // Récupération des marges dues à la position occupée par les éléments qui chevauchent le post-it
 var delta = getNoteMargin(element, overLappingElements);
 
 // Vecteurs des translations effectuées
 var u = X + delta.xLeft - element.x;
 var v = Y + delta.yTop - element.y;
 
 // Translation du post-it
 element.x += u;
 element.y += v;
 element.zOrder = lastZOrder;
 
 // Translation des éléments qui le chevauchent
 if (overLappingElements)
 for (var i in overLappingElements) {
 overLappingElements[i].x += u;
 overLappingElements[i].y += v;
 overLappingElements[i].zOrder = lastZOrder + 1;
 }
 
 return element;
 }
 catch(e) {
 throw e;
 }
 }
 */
