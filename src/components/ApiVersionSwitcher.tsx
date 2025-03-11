import { useApiVersion } from '@/contexts/ApiVersionContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { HelpCircle, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const ApiVersionSwitcher = () => {
  const { apiVersion, setApiVersion, isV2Available } = useApiVersion();

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="api-version"
        checked={apiVersion === 'v2'}
        onCheckedChange={(checked) => setApiVersion(checked ? 'v2' : 'v1')}
        disabled={!isV2Available && apiVersion !== 'v2'}
      />
      <Label
        htmlFor="api-version"
        className={`cursor-pointer ${!isV2Available ? 'text-muted-foreground' : ''}`}
      >
        API {apiVersion === 'v1' ? 'V1' : 'V2 (Tool Confirmation)'}
      </Label>

      {!isV2Available && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                V2 API not available on this server. Please upgrade your gptme server to v0.27+ to
                use this feature.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs">
              V2 API adds tool confirmation and better streaming. Requires gptme server v0.27+.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
