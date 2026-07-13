// Figma plugin main thread backend code
// This script runs in Figma's sandboxed helper thread and has access to the Figma document hierarchy.
// Communication with the UI (ui.html) is done via postMessage.

// Show UI with themeColors enabled and 320x360 dimensions
figma.showUI(__html__, {
  width: 320,
  height: 360,
  themeColors: true
});

// Send current selection details to the UI
function sendSelectionUpdate() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ 
      type: 'selection-change', 
      selected: false, 
      message: 'No layers selected' 
    });
  } else if (selection.length > 1) {
    figma.ui.postMessage({ 
      type: 'selection-change', 
      selected: false, 
      message: 'Multiple layers selected' 
    });
  } else {
    const node = selection[0];
    figma.ui.postMessage({
      type: 'selection-change',
      selected: true,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      width: node.width,
      height: node.height
    });
  }
}

// Watch for selection changes
figma.on('selectionchange', sendSelectionUpdate);

// Send initial selection state on startup
sendSelectionUpdate();

// Handle messages from the UI iframe
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'export-selection') {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) {
      figma.ui.postMessage({ 
        type: 'error', 
        message: 'Please select exactly one layer to export.' 
      });
      return;
    }
    
    const node = selection[0];
    try {
      // Notify the UI that we are exporting
      figma.ui.postMessage({ type: 'exporting-started' });
      
      // Export node to PNG format bytes at 2x scale for higher resolution/quality
      const bytes = await node.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 2 }
      });
      
      figma.ui.postMessage({ 
        type: 'exported-image', 
        bytes: bytes, 
        nodeName: node.name,
        width: node.width,
        height: node.height
      });
    } catch (err) {
      console.error(err);
      figma.ui.postMessage({ 
        type: 'error', 
        message: 'Could not export selection. Make sure it is a visible layer.' 
      });
    }
  }
  
  else if (msg.type === 'paste-image') {
    try {
      const { bytes, name, width, height } = msg;
      
      // Create image object in Figma from bytes
      const image = figma.createImage(bytes);
      
      // Create a rectangle to host the image fill
      const rect = figma.createRectangle();
      
      // Maintain same dimensions
      const targetWidth = width || 300;
      const targetHeight = height || 300;
      rect.resize(targetWidth, targetHeight);
      
      // Set name
      const baseName = name ? name.replace(/\.[^/.]+$/, "") : "Image";
      rect.name = `${baseName} (No BG)`;
      
      // Apply the image fill
      rect.fills = [
        {
          type: 'IMAGE',
          imageHash: image.hash,
          scaleMode: 'FILL'
        }
      ];
      
      // Position the new rectangle adjacent to the selected node, if any
      const selection = figma.currentPage.selection;
      if (selection.length === 1) {
        const selectedNode = selection[0];
        rect.x = selectedNode.x + selectedNode.width + 20;
        rect.y = selectedNode.y;
        
        // Add to same parent container if possible
        if (selectedNode.parent) {
          selectedNode.parent.appendChild(rect);
        }
      } else {
        // Fallback: place in the center of current viewport
        rect.x = figma.viewport.center.x - targetWidth / 2;
        rect.y = figma.viewport.center.y - targetHeight / 2;
        figma.currentPage.appendChild(rect);
      }
      
      // Update selection to the new background-removed node
      figma.currentPage.selection = [rect];
      figma.viewport.scrollAndZoomIntoView([rect]);
      
      figma.notify('Successfully pasted background-removed image!');
    } catch (err) {
      console.error(err);
      figma.notify('Error: Failed to insert background-removed image.');
    }
  }
  
  else if (msg.type === 'notify') {
    figma.notify(msg.message);
  }
  
  else if (msg.type === 'resize') {
    figma.ui.resize(msg.width, msg.height);
  }
  
  else if (msg.type === 'close') {
    figma.closePlugin();
  }
};
