import React from 'react';
import { X, MousePointer2, Move, Edit3, Search, List, Type, PlusCircle, PenTool } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-5 duration-300 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-950/50">
          <h2 className="text-xl font-semibold text-white">How to use Onyx Canvas</h2>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                
                {/* Desktop Column */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-6 pb-2 border-b border-zinc-800">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                            <MousePointer2 size={24} />
                        </div>
                        <h3 className="text-lg font-medium text-white">Desktop Controls</h3>
                    </div>
                    
                    <ul className="space-y-4">
                        <InstructionItem 
                            icon={<PlusCircle size={18} />}
                            title="Add Images"
                            text="Drag and drop files directly onto the canvas, or right-click empty space and select 'New Image'."
                        />
                        <InstructionItem 
                            icon={<Move size={18} />}
                            title="Move & Pan"
                            text="Left-click and drag an image to move it. Click and drag empty space to pan around the canvas. Use mouse wheel to zoom."
                        />
                        <InstructionItem 
                            icon={<Edit3 size={18} />}
                            title="Edit Images"
                            text="Double-click an image (or right-click > Edit) to open the editor. Adjust colors, crop, and draw."
                        />
                        <InstructionItem 
                            icon={<Search size={18} />}
                            title="Navigation"
                            text="Click the Search icon to fly to the nearest image if you get lost."
                        />
                        <InstructionItem 
                            icon={<List size={18} />}
                            title="Image List"
                            text="Click the Menu icon to see a full list of images. Click a name to jump to it."
                        />
                        <InstructionItem 
                            icon={<Type size={18} />}
                            title="Rename"
                            text="Right-click an image and select 'Rename' to change its label."
                        />
                    </ul>
                </div>

                {/* Mobile Column */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-6 pb-2 border-b border-zinc-800">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                            <PenTool size={24} />
                        </div>
                        <h3 className="text-lg font-medium text-white">Mobile Controls</h3>
                    </div>

                    <ul className="space-y-4">
                         <InstructionItem 
                            icon={<PlusCircle size={18} />}
                            title="Add Images"
                            text="Long-press on empty space and select 'New Image' to upload from your gallery."
                        />
                        <InstructionItem 
                            icon={<Move size={18} />}
                            title="Move & Pan"
                            text="Tap an image to select it, then drag to move. Drag empty space to pan. Pinch with two fingers to zoom."
                        />
                        <InstructionItem 
                            icon={<Edit3 size={18} />}
                            title="Edit Images"
                            text="Double-tap an image to open the editor. Access crop, filters, and drawing tools from the bottom sheet."
                        />
                        <InstructionItem 
                            icon={<Search size={18} />}
                            title="Navigation"
                            text="Tap the Search icon (top-left) to center the view on the nearest image."
                        />
                        <InstructionItem 
                            icon={<List size={18} />}
                            title="Image List"
                            text="Tap the Menu icon (top-left) to open the sidebar list. Tap an item to fly to it."
                        />
                        <InstructionItem 
                            icon={<Type size={18} />}
                            title="Context Menu"
                            text="Long-press an image to see options like Rename, Delete, or Download."
                        />
                    </ul>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};

const InstructionItem = ({ icon, title, text }: { icon: React.ReactNode, title: string, text: string }) => (
    <li className="flex gap-4">
        <div className="mt-0.5 shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
            {icon}
        </div>
        <div>
            <h4 className="text-sm font-semibold text-zinc-200 mb-0.5">{title}</h4>
            <p className="text-sm text-zinc-400 leading-relaxed">{text}</p>
        </div>
    </li>
);
